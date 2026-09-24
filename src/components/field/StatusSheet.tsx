import { useState } from "react";
import { format, addDays, setHours, setMinutes } from "date-fns";
import { toast } from "sonner";
import type { ClientStatus } from "@/lib/types";
import { Sheet } from "./Sheet";

export type ActionStatus = Exclude<ClientStatus, "pending">;

const COPY: Record<ActionStatus, { title: string; label: string; placeholder: string; required?: boolean }> = {
  withdrawn: { title: "Equipamento Retirado", label: "Observação (opcional)", placeholder: "Ex: Desmontado sem problemas" },
  refused: { title: "Cliente Recusado", label: "Observação (opcional)", placeholder: "Ex: Não quer devolver" },
  analysis: {
    title: "Enviado para Análise",
    label: "Motivo / Observação",
    placeholder: "Ex: Cliente diz que equipamento foi comprado",
    required: true,
  },
  scheduled: { title: "Agendar Retorno", label: "Observação (opcional)", placeholder: "Ex: Cliente atendeu, agendou para amanhã 10h" },
};

const CONFIRM_STYLE: Record<ActionStatus, string> = {
  withdrawn: "bg-mint text-ink",
  refused: "bg-rose text-ink",
  analysis: "bg-mist text-ink",
  scheduled: "bg-amber text-ink",
};

export function StatusSheet({
  status,
  onClose,
  onConfirm,
}: {
  status: ActionStatus | null;
  onClose: () => void;
  onConfirm: (status: ActionStatus, note: string, scheduledFor: string | null) => void;
}) {
  const tomorrow = addDays(new Date(), 1);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(format(tomorrow, "yyyy-MM-dd"));
  const [time, setTime] = useState("14:00");

  if (!status) return null;
  const copy = COPY[status];

  const confirm = () => {
    if (copy.required && note.trim() === "") {
      toast.warning("Escreve o motivo para enviar para análise.");
      return;
    }
    let scheduledFor: string | null = null;
    if (status === "scheduled") {
      if (!date || !time) {
        toast.warning("Escolhe data e hora.");
        return;
      }
      const [h, m] = time.split(":").map(Number);
      const d = setMinutes(setHours(new Date(`${date}T00:00:00`), h ?? 0), m ?? 0);
      scheduledFor = d.toISOString();
    }
    onConfirm(status, note.trim(), scheduledFor);
    setNote("");
  };

  const quick = (d: Date, hh: number) => {
    setDate(format(d, "yyyy-MM-dd"));
    setTime(`${String(hh).padStart(2, "0")}:00`);
  };

  return (
    <Sheet open onClose={onClose} title={copy.title}>
      {status === "scheduled" && (
        <div className="mb-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="glass-soft flex flex-col rounded-xl px-3 py-2.5">
              <span className="text-[10px] tracking-wide text-steel uppercase">Data</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent text-[15px] font-medium outline-none" />
            </label>
            <label className="glass-soft flex flex-col rounded-xl px-3 py-2.5">
              <span className="text-[10px] tracking-wide text-steel uppercase">Hora</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="bg-transparent text-[15px] font-medium outline-none" />
            </label>
          </div>
          <div className="mt-2 flex gap-1.5">
            <QuickChip onClick={() => quick(new Date(), new Date().getHours() + 2)}>Hoje +2h</QuickChip>
            <QuickChip onClick={() => quick(tomorrow, 10)}>Amanhã 10h</QuickChip>
            <QuickChip onClick={() => quick(tomorrow, 14)}>Amanhã 14h</QuickChip>
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-[11px] tracking-wide text-steel uppercase">{copy.label}</span>
        <textarea
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={copy.placeholder}
          className="glass-soft mt-1.5 w-full resize-none rounded-xl px-3 py-3 text-[15px] outline-none placeholder:text-steel/60 focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={onClose} className="glass-soft rounded-xl py-3.5 font-display text-[15px] font-semibold text-mist tap">
          Cancelar
        </button>
        <button onClick={confirm} className={`rounded-xl py-3.5 font-display text-[15px] font-bold tap ${CONFIRM_STYLE[status]}`}>
          Confirmar
        </button>
      </div>
    </Sheet>
  );
}

function QuickChip({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass-soft rounded-full px-3 py-1.5 text-[11px] font-medium text-mist tap">
      {children}
    </button>
  );
}
