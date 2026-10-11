/** Mensagem pré-programada para quem não atendeu. Texto editável aqui. */
export const NO_ANSWER_MESSAGE =
  "Boa tarde, sou o técnico responsável pela recolha do equipamento. Tentei contactá-lo sem sucesso. Pode indicar um melhor horário para agendarmos a retirada? Obrigado.";

/** Número em formato internacional sem "+" (Portugal: 351 + 9 dígitos). */
export function waNumber(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 9) return `351${d}`;
  if (d.startsWith("00")) return d.slice(2);
  return d;
}

/** Abre o WhatsApp com a mensagem já escrita. */
export function whatsappUrl(phone: string, text = NO_ANSWER_MESSAGE): string | null {
  const n = waNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
