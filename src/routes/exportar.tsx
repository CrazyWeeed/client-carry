import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AppShell } from "@/components/field/AppShell";
import { useFieldStore } from "@/lib/store";
import { exportWorkbook } from "@/lib/excel";
import { STATUS_LABEL, STATUS_STYLE, type ClientStatus } from "@/lib/types";

export const Route = createFileRoute("/exportar")({
  head: () => ({
    meta: [
      { title: "Exportar Excel — Gestão de clientes" },
      { name: "description", content: "Gera o Excel com status, observações, agendamentos e histórico." },
      { property: "og:title", content: "Exportar Excel — Gestão de clientes" },
      { property: "og:description", content: "Gera o Excel com status, observações, agendamentos e histórico." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExportPage,
});

const ORDER: ClientStatus[] = ["pending", "noAnswer", "wrongPhone", "notAssigned", "scheduled", "analysis", "refused", "withdrawn"];

// What the file gains, in plain words. Column names kept for whoever reads the file.
const ADDED = [
  { what: "Nº Cliente, status e rótulo", cols: "Status_Prosegur · Status_Label" },
  { what: "Data da última mudança", cols: "Status_Data" },
  { what: "Última observação", cols: "Observacao_Ultima" },
  { what: "Data do agendamento", cols: "Agendado_Para" },
  { what: "Resumo e histórico completo", cols: "Historico_Resumido · Historico_JSON" },
];

function ExportPage() {
  const clients = useFieldStore((s) => s.clients);
  const importedAt = useFieldStore((s) => s.importedAt);
  const importedFileName = useFieldStore((s) => s.importedFileName);
  const [busy, setBusy] = useState(false);

  const counts = ORDER.map((s) => [s, clients.filter((c) => c.status === s).length] as const);
  const done = clients.filter((c) => c.status !== "pending").length;
  const pct = clients.length ? Math.round((done / clients.length) * 100) : 0;

  const run = async () => {
    if (clients.length === 0) {
      toast.error("Importa um Excel primeiro.");
      return;
    }
    setBusy(true);
    try {
      const name = await exportWorkbook(clients, importedFileName);
      toast.success("Excel gerado", { description: name });
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Exportar">
      <section className="pt-1">
        <p className="text-[12px] tracking-wide text-steel uppercase">Progresso</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold tracking-tight text-foreground">{done}</span>
          <span className="font-display text-lg text-steel">de {clients.length} com status</span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[12px] text-steel">{pct}% concluído</p>
      </section>

      <section className="mt-6">
        <p className="mb-1 text-[12px] tracking-wide text-steel uppercase">Por status</p>
        <ul className="divide-y divide-border border-y border-border">
          {counts.map(([s, n]) => (
            <li key={s} className="flex items-center justify-between py-3">
              <span className="flex items-center gap-2.5 text-[15px]">
                <span className={`size-2 rounded-full ${STATUS_STYLE[s].dot}`} />
                {STATUS_LABEL[s]}
              </span>
              <span className="font-display text-[15px] font-semibold tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <p className="mb-2 text-[12px] tracking-wide text-steel uppercase">O arquivo inclui</p>
        <p className="text-[13px] text-steel">
          As colunas originais ficam intactas. Estas são acrescentadas:
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {ADDED.map((a) => (
            <li key={a.what} className="flex flex-col">
              <span className="text-[14px] text-foreground">{a.what}</span>
              <span className="text-[12px] text-steel">{a.cols}</span>
            </li>
          ))}
        </ul>
      </section>

      {importedAt && (
        <p className="mt-6 text-[12px] text-steel">
          Última importação: {format(new Date(importedAt), "dd/MM HH:mm")}
        </p>
      )}

      <button
        onClick={run}
        disabled={busy || clients.length === 0}
        className="mt-6 flex min-h-14 w-full items-center justify-center rounded-xl bg-accent font-display text-[16px] font-bold text-ink tap disabled:opacity-40"
      >
        {busy ? "Gerando…" : "Descarregar Excel"}
      </button>
    </AppShell>
  );
}
