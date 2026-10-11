import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/field/AppShell";
import { useFieldStore } from "@/lib/store";
import { concelhoOf, fold } from "@/lib/concelhos";
import shape from "@/data/norte_concelhos.json";
import type { Client } from "@/lib/types";

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
const CONCELHOS = shape as Concelho[];

// Limites do desenho (coordenadas em metros, PT-TM06).
const BOUNDS = (() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of CONCELHOS) for (const p of c.poly) for (const ring of p) for (const pt of ring) {
    const x = pt[0] ?? 0, y = pt[1] ?? 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
})();

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

type Situacao = "verde" | "amarelo" | "vermelho" | "cinza";
type Stat = { total: number; pendentes: number; feitos: number; andamento: number };

// "Feito" = retirado ou recusado. Agendado e em análise ainda não contam como feito.
const isFeito = (c: Client) => c.status === "withdrawn" || c.status === "refused";

function situacao(s: Stat): Situacao {
  if (s.total === 0) return "cinza";
  if (s.feitos === s.total) return "verde";
  if (s.feitos === 0) return "vermelho";
  return "amarelo";
}

const FILL: Record<Situacao, string> = {
  verde: "oklch(0.72 0.1 155)",
  amarelo: "oklch(0.8 0.12 85)",
  vermelho: "oklch(0.66 0.14 25)",
  cinza: "oklch(0.3 0 0)",
};

function MapPage() {
  const clients = useFieldStore((s) => s.clients);
  const [selected, setSelected] = useState<string | null>(null);

  const { porConcelho, foraRegiao, semConcelho } = useMemo(() => {
    const por = new Map<string, Stat>();
    const north = new Set(CONCELHOS.map((c) => fold(c.nome)));
    let fora = 0, sem = 0;
    for (const c of clients) {
      const nome = concelhoOf(c);
      if (!nome) { sem++; continue; }
      if (!north.has(fold(nome))) { fora++; continue; }
      const k = fold(nome);
      const s = por.get(k) ?? { total: 0, pendentes: 0, feitos: 0, andamento: 0 };
      s.total++;
      if (c.status === "pending") s.pendentes++;
      else if (isFeito(c)) s.feitos++;
      else s.andamento++;
      por.set(k, s);
    }
    return { porConcelho: por, foraRegiao: fora, semConcelho: sem };
  }, [clients]);

  const sel = selected ? CONCELHOS.find((c) => fold(c.nome) === selected) : null;
  const selStat = selected ? porConcelho.get(selected) ?? { total: 0, pendentes: 0, feitos: 0, andamento: 0 } : null;

  return (
    <AppShell title="Mapa">
      <div className="mt-1 flex items-center gap-3 text-[11px] text-steel">
        <Legenda cor={FILL.verde} texto="Tudo feito" />
        <Legenda cor={FILL.amarelo} texto="Parcial" />
        <Legenda cor={FILL.vermelho} texto="Nada feito" />
        <Legenda cor={FILL.cinza} texto="Sem clientes" />
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card p-2">
        <svg
          viewBox={`0 0 ${(BOUNDS.maxX - BOUNDS.minX).toFixed(0)} ${(BOUNDS.maxY - BOUNDS.minY).toFixed(0)}`}
          className="h-auto w-full"
          role="img"
          aria-label="Mapa dos concelhos do norte"
        >
          {CONCELHOS.map((c) => {
            const k = fold(c.nome);
            const s = porConcelho.get(k) ?? { total: 0, pendentes: 0, feitos: 0, andamento: 0 };
            const active = selected === k;
            return (
              <path
                key={c.dico}
                d={PATHS.get(k)}
                fillRule="evenodd"
                fill={FILL[situacao(s)]}
                stroke={active ? "oklch(0.95 0 0)" : "oklch(0.13 0 0)"}
                strokeWidth={active ? 900 : 300}
                onClick={() => setSelected(active ? null : k)}
                className="cursor-pointer transition-[fill] duration-200"
              >
                <title>{c.nome}</title>
              </path>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 min-h-20">
        {sel && selStat ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-[17px] font-semibold">{sel.nome}</p>
              <span className="text-[12px] text-steel">{selStat.total} clientes</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Num label="Pendentes" value={selStat.pendentes} />
              <Num label="Feitos" value={selStat.feitos} />
              <Num label="Em andamento" value={selStat.andamento} />
            </div>
          </div>
        ) : (
          <p className="px-1 text-[12px] text-steel">Toque num concelho para ver a situação.</p>
        )}
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
