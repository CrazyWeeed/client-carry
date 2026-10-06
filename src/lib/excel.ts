import type { Client, ClientStatus, ClientType, HistoryEntry } from "./types";
import { STATUS_LABEL } from "./types";
import { ORIGINAL_FILE_KEY } from "./store";
import { format, addDays, setHours, setMinutes } from "date-fns";

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const MATCHERS: Record<string, string[]> = {
  contract: ["contrato", "contract", "n contrato", "nº contrato", "num contrato", "numero", "n.", "id"],
  name: ["nome", "name", "cliente", "customer", "titular"],
  phone: ["telefone", "telemovel", "tel", "phone", "contacto", "contato", "movel"],
  zip: ["codigo postc", "codigo postal", "cod postal", "postc", "cep", "cp", "postal", "zip"],
  address: ["morado", "morada", "endereco", "address", "rua", "direccion"],
  type: ["tipo", "type", "segmento", "categoria"],
  statusProsegur: ["status_prosegur", "status prosegur", "status_carry", "status carry", "status"],
  agendadoPara: ["agendado_para", "agendado para", "agendamento", "scheduled"],
  observacaoUltima: ["observacao_ultima", "observacao ultima", "nota", "notas", "note"],
};

// App-written columns: if an old export duplicated them (Status_Carry, Status_Carry_1),
// the LAST copy is the newest value — never the stale first one.
const LAST_WINS = new Set(["statusProsegur", "agendadoPara", "observacaoUltima"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function findColumn(headers: string[], key: keyof typeof MATCHERS): string | null {
  // SheetJS suffixes duplicate headers (Contacto, Contacto_1) — match on the
  // base name so a re-imported export still resolves both columns.
  const nh = headers.map((h) => ({ raw: h, n: norm(h.replace(/_\d+$/, "")) }));
  const pick = LAST_WINS.has(key) ? [...nh].reverse() : nh;
  const list = MATCHERS[key] ?? [];
  for (const m of list) {
    const exact = pick.find((h) => h.n === m);
    if (exact) return exact.raw;
  }
  // Short tokens ("id", "cp", "n.") are only ever taken literally — never as a
  // substring, otherwise "Validade" or "Identificação" would win the match.
  // App-written columns are only ever matched exactly (avoids "Status_Label").
  if (LAST_WINS.has(key)) return null;
  for (const m of list) {
    if (m.length < 4) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(m)}`);
    const partial = nh.find((h) => re.test(h.n));
    if (partial) return partial.raw;
  }
  return null;
}

export interface Cols {
  contract: number;
  name: number;
  phone: number;
  zip: number;
  address: number;
  type: number;
  statusProsegur: number;
  agendadoPara: number;
  observacaoUltima: number;
}

/**
 * Column positions, resolved from the headers:
 * - two "Contacto" headers → 1st is the contract, 2nd is the phone
 * - one  "Contacto" header  → it is the phone; the contract comes from another header
 * - none                    → both are looked up by name
 * The contract never ends up being the phone column.
 */
export function locateColumns(headers: string[]): Cols {
  const idxOf = (raw: string | null) => (raw === null ? -1 : headers.indexOf(raw));
  const lastIdx = (raw: string | null) => (raw === null ? -1 : headers.lastIndexOf(raw));
  const contactoIdxs = headers.map((h, i) => (norm(h.replace(/_\d+$/, "")) === "contacto" ? i : -1)).filter((i) => i >= 0);

  let contract = -1;
  let phone = -1;

  if (contactoIdxs.length >= 2) {
    contract = contactoIdxs[0]!;
    phone = contactoIdxs[1]!;
  } else if (contactoIdxs.length === 1) {
    phone = contactoIdxs[0]!;
    contract = idxOf(findColumn(headers, "contract"));
  } else {
    contract = idxOf(findColumn(headers, "contract"));
    phone = idxOf(findColumn(headers, "phone"));
  }

  if (contract < 0 || contract === phone) {
    const taken = new Set(
      [phone, idxOf(findColumn(headers, "name")), idxOf(findColumn(headers, "zip")), idxOf(findColumn(headers, "address")), idxOf(findColumn(headers, "type"))].filter(
        (i) => i >= 0,
      ),
    );
    contract = headers.findIndex((h, i) => !taken.has(i) && norm(h) !== "");
    if (contract < 0) contract = phone === 0 ? 1 : 0;
  }

  return {
    contract,
    name: idxOf(findColumn(headers, "name")),
    phone,
    zip: idxOf(findColumn(headers, "zip")),
    address: idxOf(findColumn(headers, "address")),
    type: idxOf(findColumn(headers, "type")),
    statusProsegur: lastIdx(findColumn(headers, "statusProsegur")),
    agendadoPara: lastIdx(findColumn(headers, "agendadoPara")),
    observacaoUltima: lastIdx(findColumn(headers, "observacaoUltima")),
  };
}

/** Unique keys mirroring SheetJS duplicate-header suffixing (Contacto, Contacto_1...). */
function uniqKeys(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const base = h || "col";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n - 1}`;
  });
}

function hashId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "c" + (h >>> 0).toString(36);
}

function parseType(v: unknown): ClientType {
  const n = norm(v);
  if (n.startsWith("com") || n.includes("empresa") || n.includes("negocio")) return "commercial";
  return "residential";
}

/** Status written by our own export (Status_Carry; legacy files keep Status_Prosegur) — tolerates keys and PT labels. */
function parseExcelStatus(v: unknown): ClientStatus {
  const n = norm(v);
  if (n.includes("retirad") || n === "withdrawn") return "withdrawn";
  if (n.includes("recusad") || n === "refused") return "refused";
  if (n.includes("analise") || n.includes("analysis")) return "analysis";
  if (n.includes("agendad") || n.includes("scheduled")) return "scheduled";
  return "pending";
}

/** Agendado_Para written by our export ("dd/MM/yyyy HH:mm"), ISO, or bare "HH:mm" → tomorrow. */
function parseScheduledFor(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const dt = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (dt) {
    const d = new Date(Number(dt[3]), Number(dt[2]) - 1, Number(dt[1]), Number(dt[4]), Number(dt[5]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const hm = t.match(/(\d{1,2}):(\d{2})/);
  if (hm) {
    const tomorrow = addDays(new Date(), 1);
    const d = setMinutes(setHours(new Date(`${format(tomorrow, "yyyy-MM-dd")}T00:00:00`), Number(hm[1])), Number(hm[2]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export interface ParseResult {
  clients: Client[];
  sheets: number;
  skipped: number;
}

export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const clients: Client[] = [];
  let skipped = 0;
  const now = new Date().toISOString();

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    if (grid.length < 2) continue;
    const rawHeaders = (grid[0] ?? []).map((h) => String(h ?? ""));
    const keys = uniqKeys(rawHeaders);
    const cols = locateColumns(rawHeaders);
    const get = (row: unknown[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");

    for (const row of grid.slice(1)) {
      const name = get(row, cols.name);
      const phone = get(row, cols.phone);
      let contract = get(row, cols.contract);
      // A contract that is just the phone number repeated is never a contract.
      const cDigits = contract.replace(/\D/g, "");
      const pDigits = phone.replace(/\D/g, "");
      if (cDigits && pDigits && cDigits === pDigits) contract = "";
      if (!contract && !name) {
        skipped++;
        continue;
      }
      const contractNumber = contract || `${sheetName}-${name}`;
      const originalData: Record<string, unknown> = {};
      keys.forEach((k, i) => {
        originalData[k] = row[i] ?? "";
      });
      // Read back the status our own export wrote (Status_Carry / Agendado_Para),
      // so a re-import restores Retirado / Recusado / Análise / Agendado + hora.
      const status = parseExcelStatus(cols.statusProsegur >= 0 ? row[cols.statusProsegur] : "");
      const scheduledFor = status === "scheduled" ? parseScheduledFor(cols.agendadoPara >= 0 ? row[cols.agendadoPara] : "") : null;
      // Carry over the observation our own export wrote (Observacao_Ultima) so the note
      // that goes with Retirado / Recusado / Análise / Agendado survives a re-import.
      const history: HistoryEntry[] = [];
      const observacao = get(row, cols.observacaoUltima);
      if (observacao && status !== "pending") {
        history.push({ timestamp: now, status, note: observacao, scheduledFor });
      }

      clients.push({
        id: hashId(contractNumber),
        contractNumber,
        name: name || "(sem nome)",
        phone,
        zipCode: get(row, cols.zip),
        address: get(row, cols.address),
        type: parseType(cols.type >= 0 ? row[cols.type] : ""),
        status,
        scheduledFor,
        history,
        lastModified: now,
        sheetName,
        originalData,
      });
    }
  }
  return { clients, sheets: wb.SheetNames.length, skipped };
}

/* ---------- original file persistence ---------- */

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function saveOriginalFile(buf: ArrayBuffer): boolean {
  try {
    localStorage.setItem(ORIGINAL_FILE_KEY, bufToBase64(buf));
    return true;
  } catch {
    return false;
  }
}

export function loadOriginalFile(): ArrayBuffer | null {
  const b64 = localStorage.getItem(ORIGINAL_FILE_KEY);
  return b64 ? base64ToBuf(b64) : null;
}

/* ---------- export ---------- */

const fmt = (iso: string | null | undefined) => (iso ? format(new Date(iso), "dd/MM/yyyy HH:mm") : "");

/** The only columns the exported file ever contains, in this order. */
export const OFFICIAL_COLUMNS = [
  "Contrato", "Nome cliente", "Tipo", "Contacto", "Codigo postal", "Morada", "Painel", "Notas",
  "Status_Prosegur", "Status_Label", "Status_Data", "Observacao_Ultima", "Agendado_Para", "Historico_Resumido",
] as const;

function extraColumns(c: Client) {
  const last = c.history[0];
  const resumo = c.history
    .slice(0, 3)
    .map((h) => `${fmt(h.timestamp)} ${STATUS_LABEL[h.status]}${h.note ? `: ${h.note}` : ""}`)
    .join(" | ");
  return {
    Status_Prosegur: c.status,
    Status_Label: STATUS_LABEL[c.status],
    Status_Data: c.lastModified,
    Observacao_Ultima: last?.note ?? "",
    Agendado_Para: c.status === "scheduled" ? fmt(c.scheduledFor) : "",
    Historico_Resumido: resumo,
  };
}

/** Value of an original column by base header name (ignores SheetJS "_1" suffixes). */
function original(c: Client, base: string): unknown {
  const k = Object.keys(c.originalData).find((key) => norm(key.replace(/_\d+$/, "")) === base);
  return k ? c.originalData[k] : "";
}

function officialRow(c: Client): Record<string, unknown> {
  const fallback = c.contractNumber === `${c.sheetName}-${c.name}`;
  return {
    Contrato: fallback ? "" : c.contractNumber,
    "Nome cliente": c.name === "(sem nome)" ? "" : c.name,
    Tipo: c.type === "commercial" ? "Negócio" : "Residencial",
    Contacto: c.phone,
    "Codigo postal": c.zipCode,
    Morada: c.address,
    Painel: original(c, "painel"),
    Notas: original(c, "notas"),
    ...extraColumns(c),
  };
}

export async function exportWorkbook(clients: Client[], fileName: string | null) {
  const XLSX = await import("xlsx");
  const stamp = format(new Date(), "yyyyMMdd-HHmm");
  const outName = `${(fileName ?? "clientes").replace(/\.xlsx?$/i, "")}_atualizado_${stamp}.xlsx`;
  // Sheets keep their original order; every sheet gets exactly the 14 official columns.
  const order: string[] = [];
  const original = loadOriginalFile();
  if (original) order.push(...XLSX.read(original, { type: "array", bookSheets: true }).SheetNames);
  const groups = new Map<string, Client[]>(order.map((n) => [n, []]));
  for (const c of clients) groups.set(c.sheetName, [...(groups.get(c.sheetName) ?? []), c]);
  const wb = XLSX.utils.book_new();
  for (const [sheetName, list] of groups) {
    const ws = XLSX.utils.json_to_sheet(list.map(officialRow), { header: [...OFFICIAL_COLUMNS] });
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  }
  XLSX.writeFile(wb, outName);
  return outName;
}
