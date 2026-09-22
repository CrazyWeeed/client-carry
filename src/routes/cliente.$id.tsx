import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AppShell } from "@/components/field/AppShell";
import { StatusChip } from "@/components/field/ClientRow";
import { StatusSheet, type ActionStatus } from "@/components/field/StatusSheet";
import { nextPendingAfter, pendingQueue, useFieldStore } from "@/lib/store";
import { STATUS_LABEL, STATUS_STYLE, TYPE_LABEL } from "@/lib/types";
import { Phone, MapPin, Search, Check, X, CalendarClock, type LucideIcon } from "lucide-react";

export const Route = createFileRoute("/cliente/$id")({
  head: () => ({
    meta: [
      { title: "Cliente — Prosegur Field" },
      { name: "description", content: "Ficha do cliente: ligar, ver no mapa e registar retirada, recusa, análise ou agendamento." },
      { property: "og:title", content: "Cliente — Prosegur Field" },
      { property: "og:description", content: "Ficha do cliente: ligar, ver no mapa e registar retirada, recusa, análise ou agendamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientPage,
});

function ClientPage() {
  const { id } = Route.useParams();
  const clients = useFieldStore((s) => s.clients);
  const hydrated = useFieldStore((s) => s.hydrated);
  const setStatus = useFieldStore((s) => s.setStatus);
  const navigate = useNavigate();
  const [action, setAction] = useState<ActionStatus | null>(null);

  const client = clients.find((c) => c.id === id);
  const queue = pendingQueue(clients);
  const position = client ? queue.findIndex((c) => c.id === client.id) : -1;

  if (!hydrated) return <AppShell title="Cliente">{null}</AppShell>;
  if (!client) {
    return (
      <AppShell title="Cliente">
        <div className="glass rounded-2xl p-5 text-center">
          <p className="font-display font-semibold">Cliente não encontrado</p>
          <Link to="/" className="mt-3 inline-block text-[13px] text-accent">
            ← Voltar ao início
          </Link>
        </div>
      </AppShell>
    );
  }

  const digits = client.phone.replace(/\D/g, "");
  const phoneDigits = digits
    ? digits.length === 9
      ? `+351${digits}`
      : `+${digits}`
    : "";
  const mapsQuery = encodeURIComponent([client.address, client.zipCode].filter(Boolean).join(", "));

  const confirm = (status: ActionStatus, note: string, scheduledFor: string | null) => {
    setStatus(client.id, status, note, scheduledFor);
    setAction(null);
    const next = nextPendingAfter(useFieldStore.getState().clients, client.id);
    toast.success(`${client.name}: ${STATUS_LABEL[status]}`, {
      description: next ? `Próximo: ${next.name}` : "Fila de pendentes terminada",
    });
    if (next) navigate({ to: "/cliente/$id", params: { id: next.id } });
    else navigate({ to: "/" });
  };

  return (
    <AppShell title="Detalhes do Cliente">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => history.back()} className="glass-soft grid size-10 place-items-center rounded-xl text-lg tap" aria-label="Voltar">
          ←
        </button>
        <span className="text-[10px] text-steel">
          {position >= 0 ? `${position + 1} de ${queue.length} pendentes` : `${queue.length} pendentes na fila`}
        </span>
      </div>

      <div className="glass rounded-2xl p-4 animate-rise">
        <p className="text-[10px] tracking-[0.2em] text-steel uppercase">Contrato</p>
        <p className="font-display text-2xl font-bold tracking-tight text-accent">#{client.contractNumber}</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-[18px] font-semibold tracking-tight">{client.name}</p>
            <p className="mt-0.5 text-[12px] text-steel">{TYPE_LABEL[client.type]}</p>
          </div>
          <StatusChip status={client.status} />
        </div>
        {client.status === "scheduled" && client.scheduledFor && (
          <p className="mt-2 text-[12px] text-amber">Retorno: {format(new Date(client.scheduledFor), "dd/MM/yyyy 'às' HH:mm")}</p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="glass-soft rounded-xl px-3 py-2.5">
            <p className="text-[10px] tracking-wide text-steel uppercase">Telefone</p>
            <p className="mt-0.5 text-[13px] font-medium">{client.phone || "—"}</p>
          </div>
          <div className="glass-soft rounded-xl px-3 py-2.5">
            <p className="text-[10px] tracking-wide text-steel uppercase">Código Postal</p>
            <p className="mt-0.5 text-[13px] font-medium">{client.zipCode || "—"}</p>
          </div>
        </div>
        <p className="mt-2 text-[13px] text-mist/85">{client.address || "Sem morada"}</p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={phoneDigits ? `tel:${phoneDigits}` : undefined}
            aria-disabled={!phoneDigits}
            className="diag grid min-h-12 place-items-center rounded-xl bg-accent font-display text-[14px] font-bold text-ink tap aria-disabled:opacity-40"
          >
            <span className="flex items-center gap-2"><Phone className="size-4" /> Ligar</span>
          </a>
          <a
            href={`https://maps.google.com/?q=${mapsQuery}`}
            target="_blank"
            rel="noreferrer"
            className="diag-r glass-soft grid min-h-12 place-items-center rounded-xl font-display text-[14px] font-bold text-mist tap"
          >
            <span className="flex items-center gap-2"><MapPin className="size-4" /> Ver no Maps</span>
          </a>
        </div>
      </div>

      <section className="mt-5">
        <p className="mb-2 text-[11px] tracking-[0.2em] text-steel uppercase">Histórico</p>
        <div className="glass-soft space-y-3 rounded-2xl p-3.5">
          {client.history.length === 0 && <p className="text-[12px] text-steel">Sem registos.</p>}
          {client.history.map((h, i) => (
            <div key={i} className="flex gap-2.5">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_STYLE[h.status].dot}`} />
              <div className="min-w-0">
                <p className="text-[13px] font-medium">
                  {STATUS_LABEL[h.status]}
                  {h.scheduledFor ? ` para ${format(new Date(h.scheduledFor), "dd/MM HH:mm")}` : ""}
                  {h.note ? <span className="text-mist/80"> — {h.note}</span> : null}
                </p>
                <p className="text-[10px] text-steel">{format(new Date(h.timestamp), "dd/MM/yyyy HH:mm")}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-[84px] z-20 mx-auto w-full max-w-md px-4">
        <div className="glass grid grid-cols-4 gap-1.5 rounded-2xl p-1.5">
          <ActionBtn onClick={() => setAction("analysis")} className="glass-soft text-mist" icon={Search} label="Análise" />
          <ActionBtn onClick={() => setAction("withdrawn")} className="border border-mint/30 bg-mint/20 text-mint" icon={Check} label="Retirado" />
          <ActionBtn onClick={() => setAction("refused")} className="border border-rose/30 bg-rose/20 text-rose" icon={X} label="Recusado" />
          <ActionBtn onClick={() => setAction("scheduled")} className="border border-amber/30 bg-amber/20 text-amber" icon={CalendarClock} label="Agendar" />
        </div>
      </div>
      <div className="h-20" />

      <StatusSheet key={action ?? "none"} status={action} onClose={() => setAction(null)} onConfirm={confirm} />
    </AppShell>
  );
}

function ActionBtn({ onClick, className, icon: Icon, label }: { onClick: () => void; className: string; icon: LucideIcon; label: string }) {
  return (
    <button onClick={onClick} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold tap ${className}`}>
      <Icon className="size-5" />
      {label}
    </button>
  );
}
