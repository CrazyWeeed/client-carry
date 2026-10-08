import type { Client } from "./types";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function searchClients(clients: Client[], query: string): Client[] {
  const q = norm(query.trim());
  if (!q) return clients;
  const digits = q.replace(/\D/g, "");
  const exactNo = (c: Client) => !!c.idCliente && (norm(c.idCliente) === q || (digits && String(Number(digits)) === String(Number(c.idCliente.replace(/\D/g, "")))));
  const found = clients.filter((c) => {
    if (norm(c.name).includes(q)) return true;
    if (c.idCliente && norm(c.idCliente).includes(q)) return true;
    if (norm(c.contractNumber).includes(q)) return true;
    if (norm(c.zipCode).includes(q)) return true;
    if (norm(c.address).includes(q)) return true;
    if (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)) return true;
    return false;
  });
  // Exact client number first (e.g. "042" -> cliente 042), then the other matches in order.
  return [...found.filter(exactNo), ...found.filter((c) => !exactNo(c))];
}
