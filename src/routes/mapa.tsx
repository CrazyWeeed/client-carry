import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/field/AppShell";
import { useFieldStore } from "@/lib/store";
import { concelhoOf, fold } from "@/lib/concelhos";
import { ClientRow } from "@/components/field/ClientRow";
import { sortByZip } from "@/lib/store";
import shape from "@/data/norte_concelhos.json";
import type { Client, ClientStatus } from "@/lib/types";

export const Route = createFileRoute("/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa — Field Connect" },
      { name: "description", content: "Concelhos do norte com a situação dos clientes." },
      { property: "og:title", content: "Mapa — Field Connect" },
      { property: "og:description", content: "Concelhos do norte com a situação dos clientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MapPage,
});

type Concelho = { dico: string; nome: string; distrito: string; poly: number[][][][] };
const ALL_CONCELHOS = shape as Concelho[];

// Área do mapa: só o oeste e o centro do norte. Concelhos a leste de Valpaços são removidos.
const centroidX = (c: Concelho) => {
  const xs = c.poly.flatMap((p) => p.flatMap((r) => r.map((pt) => pt[0] ?? 0)));
  return xs.reduce((a, b) => a + b, 0) / xs.length;
};
const VALPACOS_CX = centroidX(ALL_CONCELHOS.find((c) => fold(c.nome) === "valpacos")!);
const CONCELHOS = ALL_CONCELHOS.filter((c) => centroidX(c) <= VALPACOS_CX + 1000);

// Limites do desenho (coordenadas em metros, PT-TM06).
const BOUNDS = (() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of CONCELHOS) for (const p of c.poly) for (const ring of p) for (const pt of ring) {
    const x = pt[0] ?? 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
  }
  for (const c of ALL_CONCELHOS) for (const p of c.poly) for (const ring of p) for (const pt of ring) {
    const y = pt[1] ?? 0;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
})();

const VIEW_W = BOUNDS.maxX - BOUNDS.minX + 3000;

const PATHS = new Map(
  CONCELHOS.map((c) => [
    fold(c.nome),
    c.poly
      .map((p) =>
        p
          .map((ring) => "M" + ring.map((pt) => `${((pt[0] ?? 0) - BOUNDS.minX).toFixed(0)} ${(BOUNDS.maxY - (pt[1] ?? 0)).toFixed(0)}`).join(" L") + " Z")
          .join(" "),
      )
      .join(" "),
  ]),
);

type Stat = { total: number; pendentes: number; retirados: number; recusados: number; outros: number };
const ZERO: Stat = { total: 0, pendentes: 0, retirados: 0, recusados: 0, outros: 0 };

function soma(s: Stat, c: Client): void {
  s.total++;
  if (c.status === "pending") s.pendentes++;
  else if (c.status === "withdrawn") s.retirados++;
  else if (c.status === "refused") s.recusados++;
  else s.outros++;
}

// "Feito" = retirado ou recusado. Agendado e em análise ainda não contam como feito.

const COR = {
  retirado: "oklch(0.75 0.09 155)",  // verde, igual ao status Retirado
  recusado: "oklch(0.68 0.14 25)",   // vermelho, igual ao status Recusado
  pendente: "oklch(0.8 0.12 85)",    // amarelo, igual ao status Pendente
  outros: "oklch(0.55 0 0)",         // cinza: agendado, em análise e contatos
  vazio: "oklch(0.3 0 0)",           // sem clientes
};

const gid = (k: string) => "g-" + k.replace(/[^a-z0-9]+/g, "-");

/** Faixas proporcionais (esquerda -> direita): retirado, recusado, outros, pendente. */
function Gradiente({ id, s }: { id: string; s: Stat }) {
  const t = s.total;
  const a = s.retirados / t;
  const b = a + s.recusados / t;
  const c = b + s.outros / t;
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor={COR.retirado} />
      <stop offset={pct(a)} stopColor={COR.retirado} />
      <stop offset={pct(a)} stopColor={COR.recusado} />
      <stop offset={pct(b)} stopColor={COR.recusado} />
      <stop offset={pct(b)} stopColor={COR.outros} />
      <stop offset={pct(c)} stopColor={COR.outros} />
      <stop offset={pct(c)} stopColor={COR.pendente} />
      <stop offset="1" stopColor={COR.pendente} />
    </linearGradient>
  );
}

/** viewBox para ampliar só um concelho (mesmas coordenadas do desenho geral). */
function zoomBox(c: Concelho): string {
  const xs = c.poly.flatMap((p) => p.flatMap((r) => r.map((pt) => pt[0] ?? 0)));
  const ys = c.poly.flatMap((p) => p.flatMap((r) => r.map((pt) => pt[1] ?? 0)));
  const pad = 2500;
  const x0 = Math.min(...xs) - BOUNDS.minX - pad;
  const y0 = BOUNDS.maxY - Math.max(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  return `${x0.toFixed(0)} ${y0.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`;
}

const FILTROS: { value: ClientStatus | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "noAnswer", label: "Não atendeu" },
  { value: "wrongPhone", label: "Tel. errado" },
  { value: "notAssigned", label: "Não atribuído" },
  { value: "scheduled", label: "Agendado" },
  { value: "analysis", label: "Em análise" },
  { value: "refused", label: "Recusado" },
  { value: "withdrawn", label: "Retirado" },
];

function MapPage() {
  const clients = useFieldStore((s) => s.clients);
  const [selected, setSelected] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<ClientStatus | "todos">("todos");

  const { porConcelho, foraRegiao, semConcelho } = useMemo(() => {
    const por = new Map<string, Stat>();
    const north = new Set(CONCELHOS.map((c) => fold(c.nome)));
    let fora = 0, sem = 0;
    for (const c of clients) {
      const nome = concelhoOf(c);
      if (!nome) { sem++; continue; }
      if (!north.has(fold(nome))) { fora++; continue; }
      const k = fold(nome);
      const s = por.get(k) ?? { ...ZERO };
      soma(s, c);
      por.set(k, s);
    }
    return { porConcelho: por, foraRegiao: fora, semConcelho: sem };
  }, [clients]);

  const sel = selected ? CONCELHOS.find((c) => fold(c.nome) === selected) : null;
  const selStat: Stat = (selected && porConcelho.get(selected)) || { ...ZERO };

  const regionClients = useMemo(
    () => (selected ? sortByZip(clients.filter((c) => fold(concelhoOf(c) ?? "") === selected)) : []),
    [clients, selected],
  );
  const regionVisible = useMemo(
    () => (filtro === "todos" ? regionClients : regionClients.filter((c) => c.status === filtro)),
    [regionClients, filtro],
  );

  // ----- Visão de uma região: só o concelho, ampliado, com a lista embaixo -----
  if (sel) {
    return (
      <AppShell title="Mapa">
        <button
          onClick={() => { setSelected(null); setFiltro("todos"); }}
          className="mt-1 flex items-center gap-1.5 text-[13px] text-steel tap"
        >
          ← Norte
        </button>

        <div className="mt-2 flex items-baseline justify-between">
          <p className="font-display text-[20px] font-semibold">{sel.nome}</p>
          <span className="text-[12px] text-steel">{selStat.total} clientes</span>
        </div>

        <div className="mt-3 rounded-xl border border-border bg-card p-2">
          <svg viewBox={zoomBox(sel)} className="h-auto w-full" role="img" aria-label={`Mapa de ${sel.nome}`}>
            <defs>
              <Gradiente id={gid(selected!)} s={selStat} />
            </defs>
            <path
              d={PATHS.get(selected!)}
              fillRule="evenodd"
              fill={selStat.total === 0 ? COR.vazio : `url(#${gid(selected!)})`}
              stroke="oklch(0.13 0 0)"
              strokeWidth={60}
            />
          </svg>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <Num label="Pendentes" value={selStat.pendentes} />
          <Num label="Retirados" value={selStat.retirados} />
          <Num label="Recusados" value={selStat.recusados} />
          <Num label="Outros" value={selStat.outros} />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const active = filtro === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFiltro(f.value)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold tap ${active ? "bg-accent text-ink" : "glass-soft text-steel"}`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[11px] tracking-[0.2em] text-steel uppercase">
            {regionVisible.length} cliente{regionVisible.length === 1 ? "" : "s"}
          </p>
          {regionVisible.length === 0 ? (
            <p className="text-[12px] text-steel">Nenhum cliente com este filtro.</p>
          ) : (
            regionVisible.map((c) => <ClientRow key={c.id} client={c} />)
          )}
        </div>
      </AppShell>
    );
  }

  // ----- Visão do norte: todos os concelhos -----
  return (
    <AppShell title="Mapa">
      <div className="mt-1 flex items-center gap-3 text-[11px] text-steel">
        <Legenda cor={COR.retirado} texto="Retirado" />
        <Legenda cor={COR.recusado} texto="Recusado" />
        <Legenda cor={COR.pendente} texto="Pendente" />
        <Legenda cor={COR.outros} texto="Outros" />
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card p-2">
        <svg
          viewBox={`0 0 ${VIEW_W.toFixed(0)} ${(BOUNDS.maxY - BOUNDS.minY).toFixed(0)}`}
          className="h-auto w-full"
          role="img"
          aria-label="Mapa dos concelhos do norte"
        >
          <defs>
            {CONCELHOS.map((c) => {
              const k = fold(c.nome);
              const s = porConcelho.get(k);
              return s && s.total > 0 ? <Gradiente key={c.dico} id={gid(k)} s={s} /> : null;
            })}
          </defs>
          {CONCELHOS.map((c) => {
            const k = fold(c.nome);
            const s = porConcelho.get(k) ?? ZERO;
            return (
              <path
                key={c.dico}
                d={PATHS.get(k)}
                fillRule="evenodd"
                fill={s.total === 0 ? COR.vazio : `url(#${gid(k)})`}
                stroke="oklch(0.13 0 0)"
                strokeWidth={300}
                onClick={() => { setSelected(k); setFiltro("todos"); }}
                className="cursor-pointer"
              >
                <title>{c.nome}</title>
              </path>
            );
          })}
        </svg>
      </div>

      {(foraRegiao > 0 || semConcelho > 0) && (
        <div className="mt-3 flex flex-col gap-2 text-[13px]">
          {foraRegiao > 0 && (
            <p className="rounded-xl border border-border px-4 py-3">Fora da região: <span className="font-semibold">{foraRegiao}</span></p>
          )}
          {semConcelho > 0 && (
            <p className="rounded-xl border border-border px-4 py-3">Sem concelho identificado: <span className="font-semibold">{semConcelho}</span></p>
          )}
        </div>
      )}
      <p className="mt-3 px-1 text-[12px] text-steel">Toque num concelho para abrir a região.</p>
    </AppShell>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: cor }} />
      {texto}
    </span>
  );
}

function Num({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-[22px] font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-steel">{label}</p>
    </div>
  );
}
