import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AppShell } from "@/components/field/AppShell";
import { useFieldStore } from "@/lib/store";
import { exportWorkbook } from "@/lib/excel";
import { STATUS_LABEL, type ClientStatus } from "@/lib/types";

export const Route = createFileRoute("/exportar")({
  head: () => ({
    meta: [
      { title: "Exportar Excel — Prosegur Field" },
      { name: "description", content: "Gera o Excel original com colunas de status, observações e agendamentos." },
      { property: "og:title", content: "Exportar Excel — Prosegur Field" },
      { property: "og:description", content: "Gera o Excel original com colunas de status, observações e agendamentos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExportPage,
});

const ORDER: ClientStatus[] = ["withdrawn", "refused", "analysis", "scheduled", "pending"];

const OUTPUT_COLUMNS = [
  { label: "Status", col: "Status_Prosegur", hint: "estado em código: pending, scheduled…" },
  { label: "Etiqueta", col: "Status_Label", hint: "o mesmo estado em português" },
  { label: "Data", col: "Status_Data", hint: "quando o estado mudou" },
  { label: "Notas", col: "Observacao_Ultima", hint: "a última observação registada" },
  { label: "Retorno", col: "Agendado_Para", hint: "data e hora do agendamento" },
  { label: "Resumo", col: "Historico_Resumido", hint: "as últimas 3 mudanças" },
];

function ExportPage() {
  const clients = useFieldStore((s) => s.clients);
  const importedAt = useFieldStore((s) => s.importedAt);
  const importedFileName = useFieldStore((s) => s.importedFileName);
  const [busy, setBusy] = useState(false);

  const counts = ORDER.map((s) => [s, clients.filter((c) => c.status === s).length] as const);
  const done = clients.filter((c) => c.status !== "pending").length;

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
      <div className="glass rounded-2xl p-4 animate-rise">
        <p className="text-[10px] tracking-[0.2em] text-steel uppercase">Resumo do dia</p>
        <p className="mt-1 font-display text-3xl font-bold tracking-tight text-accent">
          {done}
          <span className="text-lg text-steel"> / {clients.length}</span>
        </p>
        <p className="text-[12px] text-steel">clientes com status registado</p>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {counts.map(([s, n]) => (
            <div key={s} className="glass-soft rounded-xl px-1 py-2 text-center">
              <p className="font-display text-lg leading-none font-bold">{n}</p>
              <p className="mt-1 text-[8px] tracking-wide text-steel uppercase">{STATUS_LABEL[s]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-soft mt-4 rounded-2xl p-4 text-[12px] text-steel">
        <p className="font-display text-[14px] font-semibold text-mist">Ficheiro de saída</p>
        <p className="mt-1">As colunas originais ficam intactas. No fim de cada folha são acrescentadas:</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {OUTPUT_COLUMNS.map((c) => (
            <div key={c.col} className="glass rounded-xl px-3 py-2.5">
              <p className="text-[9px] tracking-[0.18em] text-steel uppercase">{c.label}</p>
              <p className="mt-0.5 font-display text-[12px] font-bold text-accent">{c.col}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-steel/90">{c.hint}</p>
            </div>
          ))}
        </div>
        {importedFileName && (
          <p className="mt-3">
            Base: <span className="text-mist">{importedFileName}</span>
            {importedAt ? ` · importado ${format(new Date(importedAt), "dd/MM HH:mm")}` : ""}
          </p>
        )}
      </div>

      <button
        onClick={run}
        disabled={busy || clients.length === 0}
        className="diag-r mt-4 flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-accent to-sky px-4 py-4 text-ink shadow-accent tap disabled:opacity-40"
      >
        <span className="font-display text-[17px] font-bold tracking-tight">{busy ? "A gerar…" : "Descarregar Excel"}</span>
        <span className="font-display text-lg font-bold">↓</span>
      </button>
    </AppShell>
  );
}
