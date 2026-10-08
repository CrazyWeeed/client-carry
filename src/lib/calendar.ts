import type { Client } from "./types";

/** Google Calendar "add event" link, prefilled. No phone, no address: the calendar syncs to the phone. */
export function googleCalendarUrl(c: Client): string | null {
  if (!c.scheduledFor) return null;
  const start = new Date(c.scheduledFor);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lastNote = [...c.history].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).find((h) => h.note)?.note ?? "";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Retorno: ${c.name} (${c.contractNumber})`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: lastNote ? `Observação: ${lastNote}` : "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
