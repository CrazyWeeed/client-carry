import type { Client } from "./types";

/**
 * Limpa a morada só para exibição, mapa e calendário. Não altera o dado guardado.
 * - tira códigos postais (o CEP é mostrado uma vez, separado)
 * - remove a cidade repetida no fim ("BRAGA BRAGA", "Vila Nova de Famalicão ... Vila Nova de Famalicão")
 */
export function cleanAddress(raw: string): string {
  let s = (raw ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/\b\d{4}-\d{3}\b/g, "").replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
  let changed = true;
  while (changed) {
    changed = false;
    const words = s.split(" ");
    for (let n = Math.min(6, Math.floor(words.length / 2)); n >= 1; n--) {
      const before = words.slice(words.length - 2 * n, words.length - n).join(" ").toLowerCase();
      const tail = words.slice(words.length - n).join(" ").toLowerCase();
      if (before === tail) {
        s = words.slice(0, words.length - n).join(" ");
        changed = true;
        break;
      }
    }
  }
  return s.replace(/[,\s]+$/, "");
}

/** Morada completa para o mapa e o calendário: morada limpa + CEP uma vez. */
export function fullAddress(c: Pick<Client, "address" | "zipCode">): string {
  const street = cleanAddress(c.address);
  return [street, c.zipCode?.trim()].filter(Boolean).join(", ");
}
