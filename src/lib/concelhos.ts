import type { Client } from "./types";

/** Minúsculas, sem acentos. */
export function fold(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Código postal de 4 dígitos -> concelho (levantado dos próprios dados e conferido nas fontes).
const CP4: Record<string, string> = {
  "4700": "Braga", "4705": "Braga", "4710": "Braga", "4715": "Braga",
  "4720": "Amares", "4730": "Vila Verde", "4740": "Esposende", "4755": "Barcelos",
  "4760": "Vila Nova de Famalicão", "4765": "Vila Nova de Famalicão", "4770": "Vila Nova de Famalicão",
  "4800": "Guimarães", "4805": "Guimarães", "4810": "Guimarães", "4815": "Vizela", "4820": "Fafe",
  "4830": "Póvoa de Lanhoso", "4835": "Guimarães", "4840": "Terras de Bouro", "4845": "Terras de Bouro",
  "4850": "Vieira do Minho", "4870": "Ribeira de Pena", "4890": "Celorico de Basto",
  "4900": "Viana do Castelo", "4905": "Viana do Castelo", "4910": "Caminha", "4920": "Vila Nova de Cerveira",
  "4925": "Viana do Castelo", "4930": "Valença", "4935": "Viana do Castelo", "4950": "Monção", "4960": "Melgaço",
  "4970": "Arcos de Valdevez", "4980": "Ponte da Barca", "4990": "Ponte de Lima",
  "5400": "Chaves", "5430": "Valpaços", "5445": "Valpaços", "5450": "Vila Pouca de Aguiar",
  "5460": "Boticas", "5470": "Montalegre",
};

// Exceções pelo código completo de 7 dígitos (mesmo CP4 com concelho diferente).
const CP7: Record<string, string> = {
  "4765-569": "Guimarães", // Serzedelo
  "4775-191": "Barcelos", "4775-192": "Barcelos", "4775-193": "Barcelos", "4775-195": "Barcelos", "4775-201": "Barcelos", // Negreiros
};

// Nomes de concelho e de freguesias conhecidas que aparecem nas moradas.
const NAME_TO_CONCELHO: Record<string, string> = {
  "braga": "Braga", "vila nova de famalicao": "Vila Nova de Famalicão", "guimaraes": "Guimarães",
  "chaves": "Chaves", "viana do castelo": "Viana do Castelo", "vila verde": "Vila Verde", "fafe": "Fafe",
  "caminha": "Caminha", "ponte de lima": "Ponte de Lima", "barcelos": "Barcelos", "vizela": "Vizela",
  "esposende": "Esposende", "amares": "Amares", "povoa de lanhoso": "Póvoa de Lanhoso",
  "vila do conde": "Vila do Conde", "povoa de varzim": "Póvoa de Varzim", "trofa": "Trofa",
  "santo tirso": "Santo Tirso", "lousada": "Lousada", "felgueiras": "Felgueiras",
  "paredes de coura": "Paredes de Coura", "arcos de valdevez": "Arcos de Valdevez", "moncao": "Monção",
  "melgaco": "Melgaço", "valenca": "Valença", "vila real": "Vila Real", "montalegre": "Montalegre",
  "boticas": "Boticas", "ponte da barca": "Ponte da Barca", "penafiel": "Penafiel", "terras de bouro": "Terras de Bouro",
  "cabeceiras de basto": "Cabeceiras de Basto", "celorico de basto": "Celorico de Basto", "mondim de basto": "Mondim de Basto",
  "vieira do minho": "Vieira do Minho", "valpacos": "Valpaços", "vila pouca de aguiar": "Vila Pouca de Aguiar",
  "ribeira de pena": "Ribeira de Pena", "vila nova de cerveira": "Vila Nova de Cerveira", "porto": "Porto",
  "maia": "Maia", "gondomar": "Gondomar", "valongo": "Valongo", "braganca": "Bragança", "mirandela": "Mirandela",
  // freguesias que pertencem a um concelho conhecido
  "vila praia de ancora": "Caminha",
};

/** Concelho a partir do código postal completo (7 dígitos) ou de 4. */
export function concelhoFromCp(cp: string): string | null {
  const m = cp.trim().match(/^(\d{4})(?:-?(\d{3}))?/);
  if (!m) return null;
  const cp7 = m[2] ? `${m[1]}-${m[2]}` : null;
  if (cp7 && CP7[cp7]) return CP7[cp7];
  if (m[1] === "4775") {
    // o mesmo 4775 cobre Barcelos (Negreiros) e Vila Nova de Famalicão (Lemenhe, Nine)
    return cp7 && (cp7.startsWith("4775-19") || cp7.startsWith("4775-20")) ? "Barcelos" : "Vila Nova de Famalicão";
  }
  return CP4[m[1]!] ?? null;
}

/** Concelho do cliente: 1) nome na morada, 2) código postal. */
export function concelhoOf(c: Pick<Client, "address" | "zipCode">): string | null {
  const addr = fold(c.address ?? "");
  // procura o nome mais longo que aparece como palavra inteira
  const names = Object.keys(NAME_TO_CONCELHO).sort((a, b) => b.length - a.length);
  for (const n of names) {
    const re = new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
    if (re.test(addr)) return NAME_TO_CONCELHO[n]!;
  }
  return concelhoFromCp(c.zipCode ?? "");
}
