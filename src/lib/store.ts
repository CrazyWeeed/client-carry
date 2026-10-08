import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Client, ClientStatus, HistoryEntry } from "./types";

export const ORIGINAL_FILE_KEY = "prosegur-field:original-xlsx";
export const AUTO_NOTE = "Importado do Excel";

/** localStorage that tells the UI when a write fails (quota full) instead of losing data silently. */
const safeStorage = {
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      window.dispatchEvent(new CustomEvent("field-storage-error"));
    }
  },
  removeItem: (k: string) => localStorage.removeItem(k),
};

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
              ...(inc.idCliente || existing.idCliente ? { idCliente: inc.idCliente || existing.idCliente } : {}),
              contractNumber: inc.contractNumber,
              name: inc.name || existing.name,
              phone: inc.phone || existing.phone,
              zipCode: inc.zipCode || existing.zipCode,
              address: inc.address || existing.address,
              type: inc.type,
              sheetName: inc.sheetName,
              originalData: inc.originalData,
              // The sheet's status (Agendado/Retirado/Recusado/Análise) wins over a local
              // one, except that a local Retirado is never overwritten.
              // History is never dropped: union of what the sheet carries and what the app recorded.
              history: mergeHistory(inc.history, existing.history),
              // Most recent change wins: an older file cannot undo a newer change made in the app.
              ...(inc.status !== "pending" && existing.status !== "withdrawn" && inc.lastModified >= existing.lastModified
                ? {
                    status: inc.status,
                    scheduledFor: inc.scheduledFor,
                    lastModified: inc.lastModified,
                  }
                : {}),
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
                : [],
              lastModified: now,
            });
            added++;
          }
        }
        // One client = one record. Rows imported by an older version (e.g. ID_Cliente
        // read as the contract) duplicate the same person under another id: collapse
        // them onto the current contract, keeping the most recent status + history.
        const currentIds = new Set(incoming.map((c) => c.id));
        set({ clients: dedupeClients(Array.from(map.values()), currentIds), importedAt: now, importedFileName: fileName });
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

      clearAll: () => {
        if (typeof window !== "undefined") localStorage.removeItem(ORIGINAL_FILE_KEY);
        set({ clients: [], importedAt: null, importedFileName: null });
      },
    }),
    {
      name: "prosegur-field:v1",
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      partialize: (s) => ({ clients: s.clients, importedAt: s.importedAt, importedFileName: s.importedFileName }),
    },
  ),
);

/** Union of two histories (no duplicates), most recent first. */
export function mergeHistory(a: HistoryEntry[], b: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const h of [...a, ...b]) {
    const k = `${h.timestamp}|${h.status}|${h.note}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out.sort((x, y) => y.timestamp.localeCompare(x.timestamp));
}

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

/**
 * Collapse duplicated records. Conservative on purpose:
 * - Records with a REAL contract are never merged with anything (different contract = different service).
 * - Only records whose contract is synthetic ("folha-nome", i.e. no contract in the sheet)
 *   are merged, and only when phone + name + postal code all match.
 */
export function dedupeClients(clients: Client[], preferIds: Set<string> = new Set()): Client[] {
  const isSynthetic = (c: Client) => c.contractNumber === `${c.sheetName}-${c.name}`;
  const key = (c: Client) => {
    const p = normPhone(c.phone);
    const n = c.name.trim().toLowerCase();
    const z = c.zipCode.replace(/\D/g, "");
    return p && n && n !== "(sem nome)" && z ? `${p}|${n}|${z}` : null;
  };
  const groups = new Map<string, Client[]>();
  const out: Client[] = [];
  for (const c of clients) {
    const k = isSynthetic(c) ? key(c) : null;
    if (!k) { out.push(c); continue; }
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]!); continue; }
    const base = g.find((c) => preferIds.has(c.id)) ?? g[0]!;
    const latest = [...g].sort((a, b) => {
      // A worked status (anything but pending) beats an untouched pending copy.
      const w = Number(b.status !== "pending") - Number(a.status !== "pending");
      return w || b.lastModified.localeCompare(a.lastModified);
    })[0]!;
    out.push({ ...base, status: latest.status, scheduledFor: latest.scheduledFor, history: latest.history, lastModified: latest.lastModified });
  }
  return out;
}

/** How many times the client was called without answer (from the history). */
export function attemptCount(c: Client): number {
  return c.history.filter((h) => h.status === "noAnswer").length;
}

/** Last "não atendeu" timestamp (ISO) or null. */
export function lastAttemptAt(c: Client): string | null {
  const last = c.history.find((h) => h.status === "noAnswer");
  return last ? last.timestamp : null;
}

/**
 * "Para ligar" order: no answer first (fewest attempts, then the one called longest ago),
 * then wrong number, then not assigned.
 */
export function callQueue(clients: Client[]): Client[] {
  const rank: Record<string, number> = { noAnswer: 0, wrongPhone: 1, notAssigned: 2 };
  return clients
    .filter((c) => c.status in rank)
    .sort((a, b) => {
      const r = rank[a.status]! - rank[b.status]!;
      if (r) return r;
      if (a.status === "noAnswer") {
        const n = attemptCount(a) - attemptCount(b);
        if (n) return n;
        return (lastAttemptAt(a) ?? "").localeCompare(lastAttemptAt(b) ?? "");
      }
      return a.lastModified.localeCompare(b.lastModified);
    });
}

