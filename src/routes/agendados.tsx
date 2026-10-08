import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { pt } from "date-fns/locale";
import { toast } from "sonner";
import { AppShell } from "@/components/field/AppShell";
import { ClientRow, EmptyState } from "@/components/field/ClientRow";
import { StatusSheet, type ActionStatus } from "@/components/field/StatusSheet";
import { useFieldStore } from "@/lib/store";
import { STATUS_LABEL, type Client } from "@/lib/types";
import { googleCalendarUrl } from "@/lib/calendar";

export const Route = createFileRoute("/agendados")({
  head: () => ({
    meta: [
      { title: "Agendados — Gestão de clientes" },
      { name: "description", content: "Retornos agendados agrupados por dia, com janela de reagendamento para os atrasados." },
      { property: "og:title", content: "Agendados — Gestão de clientes" },
      { property: "og:description", content: "Retornos agendados agrupados por dia, com janela de reagendamento para os atrasados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScheduledPage,
});

const OVERDUE = "Reagendar (atrasados)";
const NO_DATE = "Sem data";

function ScheduledPage() {
  const clients = useFieldStore((s) => s.clients);
  const setStatus = useFieldStore((s) => s.setStatus);
  const [target, setTarget] = useState<Client | null>(null);

  const groups = useMemo(() => {
    const sched = clients
      .filter((c) => c.status === "scheduled")
      .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"));
    const map = new Map<string, Client[]>();
    const push = (k: string, c: Client) => map.set(k, [...(map.get(k) ?? []), c]);
    for (const c of sched) {
      if (!c.scheduledFor) { push(NO_DATE, c); continue; }
      const d = new Date(c.scheduledFor);
      if (isPast(d) && !isToday(d)) { push(OVERDUE, c); continue; }
      push(isToday(d) ? "Hoje" : isTomorrow(d) ? "Amanhã" : format(d, "EEEE, dd/MM", { locale: pt }), c);
    }
    // Overdue first (needs action), then the calendar, then undated.
    const order = [OVERDUE, "Hoje", "Amanhã"];
    const entries = Array.from(map.entries());
    entries.sort((x, y) => {
      const rank = (k: string) => (order.indexOf(k) >= 0 ? order.indexOf(k) : k === NO_DATE ? 99 : 10);
      return rank(x[0]) - rank(y[0]);
    });
    return entries;
  }, [clients]);

  const confirm = (status: ActionStatus, note: string, scheduledFor: string | null) => {
    if (!target) return;
    setStatus(target.id, status, note || "Reagendado", scheduledFor);
    toast.success(`${target.name}: reagendado`);
    setTarget(null);
  };

  return (
    <AppShell title="Agendados">
      {groups.length === 0 ? (
        <EmptyState title="Nenhum retorno agendado" hint="Usa o botão Agendar na ficha do cliente." />
      ) : (
        groups.map(([label, list]) => (
          <section key={label} className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <p className={`text-[11px] tracking-[0.2em] uppercase ${label === OVERDUE ? "text-rose" : "text-steel"}`}>{label}</p>
              <span className="text-[10px] text-steel">{list.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {list.map((c) => (
                <div key={c.id} className="flex flex-col gap-1.5">
                  <ClientRow client={c} showTime />
                  <div className="flex gap-1.5">
                    {label === OVERDUE || label === NO_DATE ? (
                      <button
                        onClick={() => setTarget(c)}
                        className="glass-soft min-h-10 flex-1 rounded-xl text-[12px] font-semibold text-amber tap"
                      >
                        Reagendar
                      </button>
                    ) : null}
                    {googleCalendarUrl(c) && (
                      <a
                        href={googleCalendarUrl(c)!}
                        target="_blank"
                        rel="noreferrer"
                        className="glass-soft flex min-h-10 flex-1 items-center justify-center rounded-xl text-[12px] font-semibold text-sky tap"
                      >
                        + Google Agenda
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <StatusSheet
        key={target?.id ?? "none"}
        status={target ? "scheduled" : null}
        onClose={() => setTarget(null)}
        onConfirm={confirm}
      />
      {target && (
        <p className="mt-2 text-center text-[10px] text-steel">
          Estado anterior: {STATUS_LABEL[target.status]} · a observação anterior fica no histórico
        </p>
      )}
    </AppShell>
  );
}
