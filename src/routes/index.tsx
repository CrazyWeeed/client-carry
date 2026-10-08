import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { isToday, isTomorrow, isPast, format } from "date-fns";
import { AppShell } from "@/components/field/AppShell";
import { ClientRow, EmptyState } from "@/components/field/ClientRow";
import { attemptCount, callQueue, lastAttemptAt, pendingQueue, sortByZip, useFieldStore } from "@/lib/store";
import { searchClients } from "@/lib/search";
import { STATUS_LABEL } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gestão de clientes" },
      { name: "description", content: "Painel diário de retiradas: pendentes, agendados e próximos clientes por Código Postal." },
      { property: "og:title", content: "Gestão de clientes" },
      { property: "og:description", content: "Painel diário de retiradas: pendentes, agendados e próximos clientes por Código Postal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const clients = useFieldStore((s) => s.clients);
  const hydrated = useFieldStore((s) => s.hydrated);
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c = { pending: 0, today: 0, analysis: 0, refused: 0, withdrawn: 0 };
    for (const cl of clients) {
      if (cl.status === "pending") c.pending++;
      else if (cl.status === "analysis") c.analysis++;
      else if (cl.status === "refused") c.refused++;
      else if (cl.status === "withdrawn") c.withdrawn++;
      else if (cl.status === "scheduled" && cl.scheduledFor && isToday(new Date(cl.scheduledFor))) c.today++;
    }
    return c;
  }, [clients]);

  const queue = useMemo(() => pendingQueue(clients), [clients]);
  const overdue = useMemo(
    () => clients.filter((c) => c.status === "scheduled" && c.scheduledFor && isPast(new Date(c.scheduledFor)) && !isToday(new Date(c.scheduledFor))).length,
    [clients],
  );
  const upcoming = useMemo(
    () =>
      sortByZip(
        clients.filter(
          (c) => c.status === "scheduled" && c.scheduledFor && (isToday(new Date(c.scheduledFor)) || isTomorrow(new Date(c.scheduledFor))),
        ),
      ).sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "")),
    [clients],
  );
  const toCall = useMemo(() => callQueue(clients), [clients]);
  const results = useMemo(() => (q.trim() ? searchClients(clients, q).slice(0, 8) : []), [clients, q]);

  const start = () => {
    const first = queue[0];
    if (first) navigate({ to: "/cliente/$id", params: { id: first.id } });
  };

  return (
    <AppShell>
      <div className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
        <span className="text-base text-steel">⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-steel/70"
          placeholder="Buscar nome, contrato, telefone, Código Postal"
        />
        {q && (
          <button onClick={() => setQ("")} className="text-steel tap" aria-label="Limpar">
            ✕
          </button>
        )}
      </div>

      {q.trim() ? (
        <section className="mt-4 flex flex-col gap-2 animate-rise">
          {results.length === 0 ? (
            <EmptyState title="Sem resultados" hint="Tenta outro nome, contrato ou Código Postal." />
          ) : (
            results.map((c) => <ClientRow key={c.id} client={c} />)
          )}
        </section>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-5 gap-1.5">
            <Counter n={counts.pending} label="Pend." tone="text-accent" status="pending" />
            <Counter n={counts.today} label="Hoje" tone="text-amber" status="scheduled" />
            <Counter n={counts.analysis} label="Análise" tone="text-mist" status="analysis" />
            <Counter n={counts.refused} label="Recus." tone="text-rose" status="refused" />
            <Counter n={counts.withdrawn} label="Retir." tone="text-mint" status="withdrawn" />
          </div>

          {overdue > 0 && (
            <Link to="/agendados" className="glass mt-4 flex items-center justify-between rounded-2xl px-4 py-3 tap">
              <span className="text-[13px] font-semibold text-rose">{overdue} agendamento(s) atrasado(s)</span>
              <span className="text-[12px] text-rose">reagendar →</span>
            </Link>
          )}

          <button
            onClick={start}
            disabled={queue.length === 0}
            className="mt-4 flex min-h-14 w-full items-center justify-between rounded-xl bg-accent px-4 text-ink tap disabled:opacity-40"
          >
            <span className="font-display text-[17px] font-bold tracking-tight">Começar Trabalho</span>
            <span className="font-display text-lg font-bold">→</span>
          </button>

          {hydrated && clients.length === 0 && (
            <div className="glass mt-5 rounded-2xl p-4 animate-rise">
              <p className="font-display text-[15px] font-semibold">Ainda sem clientes</p>
              <p className="mt-1 text-[12px] text-steel">
                Abre o menu <span className="text-mist">⋮</span> no topo e escolhe <span className="text-mist">Importar Excel</span>. O app lê todas as folhas e
                guarda tudo neste telemóvel.
              </p>
            </div>
          )}

          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] tracking-[0.2em] text-steel uppercase">Agendados hoje / amanhã</p>
              <Link to="/agendados" className="text-[11px] text-steel tap">
                ver todos →
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {upcoming.length === 0 ? (
                <p className="glass-soft rounded-2xl px-4 py-3 text-[12px] text-steel">Nenhum retorno agendado para já.</p>
              ) : (
                upcoming.slice(0, 5).map((c) => <ClientRow key={c.id} client={c} showTime />)
              )}
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] tracking-[0.2em] text-steel uppercase">Para ligar · {toCall.length}</p>
              <Link to="/clientes" className="text-[10px] text-steel tap">
                ver todos →
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {toCall.length === 0 ? (
                <p className="glass-soft rounded-2xl px-4 py-3 text-[12px] text-steel">Nenhum cliente para ligar.</p>
              ) : (
                toCall.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex flex-col gap-1">
                    <ClientRow client={c} />
                    <p className="px-1 text-[11px] text-steel">
                      {c.status === "noAnswer"
                        ? `${attemptCount(c)} tentativa${attemptCount(c) === 1 ? "" : "s"} · última ${format(new Date(lastAttemptAt(c) ?? c.lastModified), "dd/MM")}`
                        : STATUS_LABEL[c.status]}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] tracking-[0.2em] text-steel uppercase">Próximos clientes</p>
              <span className="text-[11px] text-steel">por Código Postal · {queue.length} pendentes</span>
            </div>
            <div className="flex flex-col gap-2">
              {queue.length === 0 ? (
                <p className="glass-soft rounded-2xl px-4 py-3 text-[12px] text-steel">Fila de pendentes vazia.</p>
              ) : (
                queue.slice(0, 5).map((c) => <ClientRow key={c.id} client={c} />)
              )}
            </div>
          </section>

          {hydrated && clients.length > 0 && (
            <p className="mt-5 text-center text-[11px] text-steel">
              {clients.length} clientes · atualizado {format(new Date(), "dd/MM HH:mm")}
            </p>
          )}
        </>
      )}
    </AppShell>
  );
}

function Counter({ n, label, tone, status }: { n: number; label: string; tone: string; status: string }) {
  return (
    <Link to="/clientes" search={{ status }} className="glass diag block rounded-xl px-2 py-2.5 text-center tap">
      <p className={`font-display text-xl leading-none font-bold ${tone}`}>{n}</p>
      <p className="mt-1 text-[11px] tracking-wide text-steel uppercase">{label}</p>
    </Link>
  );
}
