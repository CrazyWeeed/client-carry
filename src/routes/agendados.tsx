import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { pt } from "date-fns/locale";
import { AppShell } from "@/components/field/AppShell";
import { ClientRow, EmptyState } from "@/components/field/ClientRow";
import { useFieldStore } from "@/lib/store";
import type { Client } from "@/lib/types";

export const Route = createFileRoute("/agendados")({
  head: () => ({
    meta: [
      { title: "Agendados — Client Carry" },
      { name: "description", content: "Retornos agendados agrupados por dia: hoje, amanhã e próximos." },
      { property: "og:title", content: "Agendados — Client Carry" },
      { property: "og:description", content: "Retornos agendados agrupados por dia: hoje, amanhã e próximos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScheduledPage,
});

function ScheduledPage() {
  const clients = useFieldStore((s) => s.clients);

  const groups = useMemo(() => {
    const sched = clients
      .filter((c) => c.status === "scheduled" && c.scheduledFor)
      .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
    const map = new Map<string, Client[]>();
    for (const c of sched) {
      const d = new Date(c.scheduledFor!);
      const key = isPast(d) ? "Atrasados" : isToday(d) ? "Hoje" : isTomorrow(d) ? "Amanhã" : format(d, "EEEE, dd/MM", { locale: pt });
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return Array.from(map.entries());
  }, [clients]);

  return (
    <AppShell title="Agendados">
      {groups.length === 0 ? (
        <EmptyState title="Nenhum retorno agendado" hint="Usa o botão Agendar na ficha do cliente." />
      ) : (
        groups.map(([label, list]) => (
          <section key={label} className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] tracking-[0.2em] text-steel uppercase first-letter:uppercase">{label}</p>
              <span className="text-[10px] text-steel">{list.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {list.map((c) => (
                <ClientRow key={c.id} client={c} showTime />
              ))}
            </div>
          </section>
        ))
      )}
    </AppShell>
  );
}
