import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Client, ClientStatus, HistoryEntry } from "./types";

export const ORIGINAL_FILE_KEY = "prosegur-field:original-xlsx";

interface FieldState {
  clients: Client[];
  importedAt: string | null;
  importedFileName: string | null;
  hydrated: boolean;
  setHydrated: () => void;
  mergeClients: (incoming: Client[], fileName: string) => { added: number; updated: number };
  setStatus: (id: string, status: ClientStatus, note: string, scheduledFor?: string | null) => void;
  releaseDueSchedules: () => number;
  clearAll: () => void;
}

export const useFieldStore = create<FieldState>()(
  persist(
    (set, get) => ({
      clients: [],
      importedAt: null,
      importedFileName: null,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),

      mergeClients: (incoming, fileName) => {
        const now = new Date().toISOString();
        const map = new Map(get().clients.map((c) => [c.id, c]));
        let added = 0;
        let updated = 0;
        for (const inc of incoming) {
          const existing = map.get(inc.id);
          if (existing) {
            map.set(inc.id, {
              ...existing,
              contractNumber: inc.contractNumber,
              name: inc.name || existing.name,
              phone: inc.phone || existing.phone,
              zipCode: inc.zipCode || existing.zipCode,
              address: inc.address || existing.address,
              type: inc.type,
              sheetName: inc.sheetName,
              originalData: inc.originalData,
            });
            updated++;
          } else {
            map.set(inc.id, {
              ...inc,
              status: "pending",
              scheduledFor: null,
              history: [{ timestamp: now, status: "pending", note: "Importado do Excel" }],
              lastModified: now,
            });
            added++;
          }
        }
        set({ clients: Array.from(map.values()), importedAt: now, importedFileName: fileName });
        return { added, updated };
      },

      setStatus: (id, status, note, scheduledFor = null) => {
        const now = new Date().toISOString();
        const entry: HistoryEntry = { timestamp: now, status, note, scheduledFor };
        set({
          clients: get().clients.map((c) =>
            c.id === id
              ? {
                  ...c,
                  status,
                  scheduledFor: status === "scheduled" ? scheduledFor : null,
                  history: [entry, ...c.history],
                  lastModified: now,
                }
              : c,
          ),
        });
      },

      releaseDueSchedules: () => {
        const now = new Date();
        const iso = now.toISOString();
        let released = 0;
        const clients = get().clients.map((c) => {
          if (c.status === "scheduled" && c.scheduledFor && new Date(c.scheduledFor) <= now) {
            released++;
            return {
              ...c,
              status: "pending" as const,
              scheduledFor: null,
              history: [
                { timestamp: iso, status: "pending" as const, note: "Hora agendada chegou — de volta à fila" },
                ...c.history,
              ],
              lastModified: iso,
            };
          }
          return c;
        });
        if (released > 0) set({ clients });
        return released;
      },

      clearAll: () => {
        if (typeof window !== "undefined") localStorage.removeItem(ORIGINAL_FILE_KEY);
        set({ clients: [], importedAt: null, importedFileName: null });
      },
    }),
    {
      name: "prosegur-field:v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ clients: s.clients, importedAt: s.importedAt, importedFileName: s.importedFileName }),
    },
  ),
);

/** Sort helper: pending clients ordered by postal code. */
export function sortByZip<T extends { zipCode: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.zipCode.localeCompare(b.zipCode, "pt", { numeric: true }));
}

export function pendingQueue(clients: Client[]): Client[] {
  return sortByZip(clients.filter((c) => c.status === "pending"));
}

export function nextPendingAfter(clients: Client[], currentId: string): Client | null {
  const queue = pendingQueue(clients).filter((c) => c.id !== currentId);
  return queue[0] ?? null;
}
