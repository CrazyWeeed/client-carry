import type { Client, ClientType } from "./types";
import { STATUS_LABEL } from "./types";
import { ORIGINAL_FILE_KEY } from "./store";
import { format } from "date-fns";

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
};

function findColumn(headers: string[], key: keyof typeof MATCHERS): string | null {
  const nh = headers.map((h) => ({ raw: h, n: norm(h) }));
  const list = MATCHERS[key] ?? [];
  for (const m of list) {
    const exact = nh.find((h) => h.n === m);
    if (exact) return exact.raw;
  }
  for (const m of list) {
    const partial = nh.find((h) => h.n.includes(m));
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
}

/** Locate column indices; column 1 ("Contacto") is the contract, 2nd "Contacto" is the phone. */
export function locateColumns(headers: string[]): Cols {
  const contactoIdxs = headers.map((h, i) => (norm(h) === "contacto" ? i : -1)).filter((i) => i >= 0);
  const idx = (key: keyof typeof MATCHERS) => {
    const raw = findColumn(headers, key);
    return raw === null ? -1 : headers.indexOf(raw);
  };
  return {
    contract: contactoIdxs[0] ?? idx("contract") >= 0 ? idx("contract") : 0,
    name: idx("name"),
    phone: contactoIdxs[1] ?? idx("phone"),
    zip: idx("zip"),
    address: idx("address"),
    type: idx("type"),
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
      const contract = get(row, cols.contract);
      const name = get(row, cols.name);
      if (!contract && !name) {
        skipped++;
        continue;
      }
      const contractNumber = contract || `${sheetName}-${name}`;
      const originalData: Record<string, unknown> = {};
      keys.forEach((k, i) => {
        originalData[k] = row[i] ?? "";
      });
      clients.push({
        id: hashId(contractNumber),
        contractNumber,
        name: name || "(sem nome)",
        phone: get(row, cols.phone),
        zipCode: get(row, cols.zip),
        address: get(row, cols.address),
        type: parseType(cols.type >= 0 ? row[cols.type] : ""),
        status: "pending",
        scheduledFor: null,
        history: [],
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

export async function exportWorkbook(clients: Client[], fileName: string | null) {
  const XLSX = await import("xlsx");
  const original = loadOriginalFile();
  const byId = new Map(clients.map((c) => [c.id, c]));
  const stamp = format(new Date(), "yyyyMMdd-HHmm");
  const outName = `${(fileName ?? "clientes").replace(/\.xlsx?$/i, "")}_atualizado_${stamp}.xlsx`;

  if (original) {
    const wb = XLSX.read(original, { type: "array" });
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (rows.length === 0) continue;
      const headers = Object.keys(rows[0]!);
      const cols = locateColumns(headers);
      const merged = rows.map((row) => {
        const contract = cols.contract >= 0 ? String(row[headers[cols.contract]!] ?? "").trim() : "";
        const name = cols.name >= 0 ? String(row[headers[cols.name]!] ?? "").trim() : "";
        const contractNumber = contract || `${sheetName}-${name}`;
        const c = byId.get(hashId(contractNumber));
        return { ...row, ...(c ? extraColumns(c) : {}) };
      });
      const extraKeys = Object.keys(extraColumns(clients[0] ?? ({ history: [], status: "pending" } as unknown as Client)));
      const newWs = XLSX.utils.json_to_sheet(merged, { header: [...headers, ...extraKeys] });
      if (ws["!cols"]) newWs["!cols"] = ws["!cols"];
      wb.Sheets[sheetName] = newWs;
    }
    XLSX.writeFile(wb, outName);
    return outName;
  }

  // No original: build a fresh workbook grouped by sheet.
  const wb = XLSX.utils.book_new();
  const groups = new Map<string, Client[]>();
  for (const c of clients) {
    const g = groups.get(c.sheetName) ?? [];
    g.push(c);
    groups.set(c.sheetName, g);
  }
  for (const [sheetName, list] of groups) {
    const rows = list.map((c) => ({ ...c.originalData, ...extraColumns(c) }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName.slice(0, 31));
  }
  XLSX.writeFile(wb, outName);
  return outName;
}
