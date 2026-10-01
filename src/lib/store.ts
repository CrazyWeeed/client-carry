import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Client, ClientStatus, HistoryEntry } from "./types";

export const ORIGINAL_FILE_KEY = "prosegur-field:original-xlsx";

const normPhone = (s: unknown) => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("351") ? d.slice(3) : d;
};
const isPhoneLike = (s: string) => /^[92]\d{8}$/.test(normPhone(s));

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
          let existing = map.get(inc.id);
          if (!existing) {
            // Heal legacy rows imported with the phone number stored as contract:
            // they never match by id, so re-match them by phone and repair in place.
            const incPhone = normPhone(inc.phone);
            if (incPhone) {
              for (const c of map.values()) {
                if (isPhoneLike(c.contractNumber) && normPhone(c.contractNumber) === incPhone) {
                  existing = c;
                  break;
                }
              }
            }
          }
          if (existing) {
            if (existing.id !== inc.id) map.delete(existing.id);
            map.set(inc.id, {
              ...existing,
              id: inc.id,
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
              // Keep the status carried by the sheet (our own export writes it back).
              status: inc.status,
              scheduledFor: inc.scheduledFor,
              // The sheet can carry the observation (Observacao_Ultima) as history — keep
              // it so the note survives a clear + re-import. Only log the import itself
              // when the sheet says nothing about this client.
              history: inc.history.length
                ? inc.history
                : [{ timestamp: now, status: inc.status, note: "Importado do Excel", scheduledFor: inc.scheduledFor }],
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

/** Postal code → number (PT "4700-123" → 4700123). Missing codes sort last. */
export function zipNum(zip: string): number {
  const d = String(zip ?? "").replace(/\D/g, "");
  if (!d) return Number.MAX_SAFE_INTEGER;
  return Number(d.slice(0, 7).padEnd(7, "0"));
}

/** Sort helper: ordered numerically by postal code. */
export function sortByZip<T extends { zipCode: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => zipNum(a.zipCode) - zipNum(b.zipCode));
}

/** Closest client to a postal code (double check: smallest numeric distance, tie → lower code). */
function nearest(list: Client[], from: string): Client | null {
  const f = zipNum(from);
  let best: Client | null = null;
  let bestD = Infinity;
  for (const c of sortByZip(list)) {
    const d = Math.abs(zipNum(c.zipCode) - f);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

export function pendingQueue(clients: Client[]): Client[] {
  return sortByZip(clients.filter((c) => c.status === "pending"));
}

export function nextPendingAfter(clients: Client[], currentId: string): Client | null {
  const cur = clients.find((c) => c.id === currentId);
  const queue = pendingQueue(clients).filter((c) => c.id !== currentId);
  return cur ? nearest(queue, cur.zipCode) : (queue[0] ?? null);
}

/** Open work queue (pending + scheduled), ordered by postal code. */
export function openQueue(clients: Client[]): Client[] {
  return sortByZip(clients.filter((c) => c.status === "pending" || c.status === "scheduled"));
}

// Clients already skipped this session, so "Avançar" never bounces back and forth.
const skipped = new Set<string>();

/** Nearest open client to the current one by postal code, without changing status. */
export function nextOpenAfter(clients: Client[], current: Client): Client | null {
  skipped.add(current.id);
  const open = openQueue(clients).filter((c) => c.id !== current.id);
  let candidates = open.filter((c) => !skipped.has(c.id));
  if (!candidates.length) {
    skipped.clear();
    skipped.add(current.id);
    candidates = open;
  }
  return nearest(candidates, current.zipCode);
}
