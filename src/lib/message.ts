import type { Client } from "./types";
import { cleanAddress } from "./address";

const PARTICLES = new Set(["de", "do", "da", "dos", "das", "e"]);

/** "SARAH LIMA GALVÃO DE SOUZA" -> "Sarah Lima Galvão de Souza" */
function titleName(name: string): string {
  return name
    .toLocaleLowerCase("pt-PT")
    .split(/\s+/)
    .map((w, i) => (i > 0 && PARTICLES.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-PT") + w.slice(1)))
    .join(" ");
}

/** Contrato real (não o sintético "folha-nome" usado quando a planilha não tem número). */
function realContract(c: Client): string | null {
  if (!c.contractNumber || c.contractNumber === `${c.sheetName}-${c.name}`) return null;
  return c.contractNumber;
}

/** Mensagem pré-programada para quem não atendeu: quem sou, contrato e morada do cadastro. */
export function noAnswerMessage(c: Client): string {
  const nome = titleName(c.name);
  const contrato = realContract(c);
  const morada = titleName(cleanAddress(c.address));
  const ref = contrato ? `contrato n.º ${contrato}` : "seu contrato";
  const local = morada ? `, na morada ${morada}` : "";
  return (
    `Olá Sr./Sra. ${nome}, sou prestador de serviços contratado pela PROSEGUR ` +
    `para a retirada do equipamento de alarme. ` +
    `Entro em contacto a respeito do ${ref}${local}. ` +
    `Tentei contactá-lo sem sucesso. Poderá indicar um melhor horário para agendarmos a retirada? ` +
    `Agradeço desde já a sua atenção.`
  );
}

/** Número em formato internacional sem "+" (Portugal: 351 + 9 dígitos). */
export function waNumber(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 9) return `351${d}`;
  if (d.startsWith("00")) return d.slice(2);
  return d;
}

/** Abre o WhatsApp com a mensagem já escrita. */
export function whatsappUrl(c: Client): string | null {
  const n = waNumber(c.phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(noAnswerMessage(c))}`;
}


/** Abre o app de SMS com a mensagem completa já escrita (teste). */
export function smsUrl(c: Client): string | null {
  const n = waNumber(c.phone);
  if (!n) return null;
  return `sms:+${n}?body=${encodeURIComponent(noAnswerMessage(c))}`;
}
