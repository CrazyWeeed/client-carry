import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/field/AppShell";
import { ClientRow, EmptyState } from "@/components/field/ClientRow";
import { sortByZip, useFieldStore } from "@/lib/store";
import { searchClients } from "@/lib/search";
import { STATUS_LABEL, TYPE_LABEL, type ClientStatus, type ClientType } from "@/lib/types";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Lista de Clientes — Prosegur Field" },
      { name: "description", content: "Todos os clientes com busca instantânea e filtros por status e tipo." },
      { property: "og:title", content: "Lista de Clientes — Prosegur Field" },
      { property: "og:description", content: "Todos os clientes com busca instantânea e filtros por status e tipo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});

const STATUSES: ClientStatus[] = ["pending", "scheduled", "analysis", "refused", "withdrawn"];
const TYPES: ClientType[] = ["residential", "commercial"];

function ClientsPage() {
  const clients = useFieldStore((s) => s.clients);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ClientStatus | "all">("all");
  const [type, setType] = useState<ClientType | "all">("all");

  const list = useMemo(() => {
    let l = searchClients(clients, q);
    if (status !== "all") l = l.filter((c) => c.status === status);
    if (type !== "all") l = l.filter((c) => c.type === type);
    return sortByZip(l);
  }, [clients, q, status, type]);

  return (
    <AppShell title="Lista">
      <div className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
        <span className="text-base text-steel">⌕</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-transparent text-[15px] outline-none placeholder:text-steel/70" placeholder="Buscar nome, contrato, telefone, CEP" />
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 pr-4 [scrollbar-width:none]">
        <Chip active={status === "all"} onClick={() => setStatus("all")}>Todos</Chip>
        {STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</Chip>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 pr-4 [scrollbar-width:none]">
        <Chip active={type === "all"} onClick={() => setType("all")}>Ambos</Chip>
        {TYPES.map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(t)}>{TYPE_LABEL[t]}</Chip>
        ))}
      </div>

      <p className="mt-4 mb-2 text-[11px] tracking-[0.2em] text-steel uppercase">{list.length} clientes · por CEP</p>
      <div className="flex flex-col gap-2">
        {list.length === 0 ? (
          <EmptyState title="Nada por aqui" hint={clients.length === 0 ? "Importa o Excel pelo menu ⋮." : "Ajusta a busca ou os filtros."} />
        ) : (
          list.map((c) => <ClientRow key={c.id} client={c} showTime={c.status === "scheduled"} />)
        )}
      </div>
    </AppShell>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold tap ${active ? "bg-accent text-ink" : "glass-soft text-steel"}`}
    >
      {children}
    </button>
  );
}
