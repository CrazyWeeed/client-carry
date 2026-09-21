import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import type { Client } from "@/lib/types";
import { STATUS_LABEL, STATUS_STYLE, TYPE_LABEL } from "@/lib/types";

export function StatusChip({ status }: { status: Client["status"] }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase ${s.chip}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ClientRow({ client, showTime }: { client: Client; showTime?: boolean }) {
  return (
    <Link
      to="/cliente/$id"
      params={{ id: client.id }}
      className="glass flex items-center gap-3 rounded-2xl p-3.5 tap"
    >
      {showTime && client.scheduledFor ? (
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber/20 font-display text-[12px] font-bold text-amber">
          {format(new Date(client.scheduledFor), "HH:mm")}
        </div>
      ) : (
        <div className="grid size-11 shrink-0 place-items-center rounded-xl glass-soft font-display text-[11px] font-semibold text-accent">
          {client.zipCode.slice(0, 8) || "—"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-semibold tracking-tight">{client.name}</p>
        <p className="truncate text-[11px] text-steel">
          #{client.contractNumber} · {TYPE_LABEL[client.type]}
          {showTime && client.scheduledFor ? ` · ${format(new Date(client.scheduledFor), "dd/MM")}` : ""}
        </p>
      </div>
      <StatusChip status={client.status} />
    </Link>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="glass-soft rounded-2xl px-4 py-8 text-center">
      <p className="font-display text-[15px] font-semibold">{title}</p>
      <p className="mt-1 text-[12px] text-steel">{hint}</p>
    </div>
  );
}
