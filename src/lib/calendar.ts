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

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function hasCalendarEvent(c: Client): boolean {
  return eventFor(c) !== null;
}

/** Google Agenda na web, já preenchido. */
export function googleCalendarUrl(c: Client): string | null {
  const ev = eventFor(c);
  if (!ev) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.summary,
    dates: `${utc(ev.start)}/${utc(ev.end)}`,
    details: ev.description,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Abre o evento já preenchido no Google Agenda, sem gerar arquivo.
 * Android: abre o app do Google Agenda direto (intent), com a versão web como fallback.
 * iPhone e computador: abre a versão web do Google Agenda, já preenchida.
 */
export function addToCalendar(c: Client): void {
  const url = googleCalendarUrl(c);
  if (!url) return;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) {
    const path = url.replace(/^https:\/\//, "");
    const intent = `intent://${path}#Intent;scheme=https;package=com.google.android.calendar;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    window.location.href = intent;
    return;
  }
  window.open(url, "_blank", "noopener");
}
