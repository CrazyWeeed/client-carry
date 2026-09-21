export type ClientStatus = "pending" | "withdrawn" | "refused" | "scheduled" | "analysis";
export type ClientType = "residential" | "commercial";

export interface HistoryEntry {
  timestamp: string;
  status: ClientStatus;
  note: string;
  scheduledFor?: string | null;
}

export interface Client {
  id: string;
  contractNumber: string;
  name: string;
  phone: string;
  zipCode: string;
  address: string;
  type: ClientType;
  status: ClientStatus;
  scheduledFor: string | null;
  history: HistoryEntry[];
  lastModified: string;
  sheetName: string;
  originalData: Record<string, unknown>;
}

export const STATUS_LABEL: Record<ClientStatus, string> = {
  pending: "Pendente",
  withdrawn: "Retirado",
  refused: "Recusado",
  scheduled: "Agendado",
  analysis: "Em Análise",
};

export const TYPE_LABEL: Record<ClientType, string> = {
  residential: "Residencial",
  commercial: "Comercial",
};

/** Tailwind classes per status — chip + dot colors (design tokens only). */
export const STATUS_STYLE: Record<ClientStatus, { chip: string; dot: string; text: string }> = {
  pending: { chip: "bg-amber/15 border-amber/30 text-amber", dot: "bg-amber", text: "text-amber" },
  withdrawn: { chip: "bg-mint/15 border-mint/30 text-mint", dot: "bg-mint", text: "text-mint" },
  refused: { chip: "bg-rose/15 border-rose/30 text-rose", dot: "bg-rose", text: "text-rose" },
  scheduled: { chip: "bg-sky/15 border-sky/30 text-sky", dot: "bg-sky", text: "text-sky" },
  analysis: { chip: "bg-mist/10 border-mist/30 text-mist", dot: "bg-accent", text: "text-mist" },
};
