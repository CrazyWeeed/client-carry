import type { Client } from "./types";

/** Evento de retorno. Sem telefone e sem morada: o calendário sincroniza com o celular. */
function eventFor(c: Client) {
  if (!c.scheduledFor) return null;
  const start = new Date(c.scheduledFor);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const lastNote = [...c.history].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).find((h) => h.note)?.note ?? "";
  return {
    start,
    end,
    summary: `Retorno: ${c.idCliente ? `${c.idCliente} — ` : ""}${c.name}`,
    description: lastNote ? `Observação: ${lastNote}` : "",
  };
}

export function hasCalendarEvent(c: Client): boolean {
  return eventFor(c) !== null;
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// RFC 5545 text escaping
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function buildIcs(c: Client): string | null {
  const ev = eventFor(c);
  if (!ev) return null;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Field Connect//PT",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${c.id}-${utc(ev.start)}@field-connect`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(ev.start)}`,
    `DTEND:${utc(ev.end)}`,
    `SUMMARY:${esc(ev.summary)}`,
    ev.description ? `DESCRIPTION:${esc(ev.description)}` : "",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Retorno",
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/** Gera o .ics e abre o fluxo de adicionar ao calendário do celular (Android e iPhone). */
export async function addToCalendar(c: Client): Promise<void> {
  const ics = buildIcs(c);
  if (!ics) return;
  const name = `retorno-${(c.idCliente ?? c.id).replace(/[^\w-]/g, "")}.ics`;
  const file = new File([ics], name, { type: "text/calendar" });
  // Share sheet on mobile: lets the phone pick the calendar app directly.
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Retorno" });
      return;
    } catch {
      // cancelled or unsupported: fall back to download
    }
  }
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
