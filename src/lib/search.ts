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
  return clients.filter((c) => {
    if (norm(c.name).includes(q)) return true;
    if (norm(c.contractNumber).includes(q)) return true;
    if (norm(c.zipCode).includes(q)) return true;
    if (norm(c.address).includes(q)) return true;
    if (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)) return true;
    return false;
  });
}
