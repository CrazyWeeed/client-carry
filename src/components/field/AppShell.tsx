import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useFieldStore } from "@/lib/store";
import { parseWorkbook, saveOriginalFile, exportWorkbook } from "@/lib/excel";
import { Sheet } from "./Sheet";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { hydrated, setHydrated, releaseDueSchedules } = useFieldStore();
  const clients = useFieldStore((s) => s.clients);
  const importedFileName = useFieldStore((s) => s.importedFileName);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated) return;
    useFieldStore.persist.rehydrate();
    setHydrated();
  }, [hydrated, setHydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const run = () => {
      const n = releaseDueSchedules();
      if (n > 0) toast.info(`${n} agendado${n > 1 ? "s" : ""} voltou à fila de pendentes`);
    };
    run();
    const t = setInterval(run, 60_000);
    return () => clearInterval(t);
  }, [hydrated, releaseDueSchedules]);

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const { clients: parsed, sheets, skipped } = await parseWorkbook(buf);
      if (parsed.length === 0) {
        toast.error("Não encontrei clientes nesse ficheiro.");
        return;
      }
      const { added, updated } = useFieldStore.getState().mergeClients(parsed, file.name);
      const saved = saveOriginalFile(buf);
      toast.success(`${added} novos, ${updated} atualizados`, {
        description: `${sheets} folhas lidas${skipped ? `, ${skipped} linhas vazias ignoradas` : ""}${saved ? "" : " · ficheiro original grande demais para guardar"}`,
      });
      setMenuOpen(false);
      navigate({ to: "/" });
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler o Excel.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onExport = async () => {
    if (clients.length === 0) {
      toast.error("Nada para exportar ainda.");
      return;
    }
    setBusy(true);
    try {
      const name = await exportWorkbook(clients, importedFileName);
      toast.success("Excel gerado", { description: name });
      setMenuOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar.");
    } finally {
      setBusy(false);
    }
  };

  const onClear = () => {
    if (!confirm("Apagar todos os clientes e histórico deste telemóvel?")) return;
    useFieldStore.getState().clearAll();
    setMenuOpen(false);
    toast.success("Dados apagados");
    navigate({ to: "/" });
  };

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-hidden">
      <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-accent/25 blur-3xl" />
      <div className="pointer-events-none absolute top-40 -left-20 size-64 rounded-full bg-amber/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 bottom-0 size-56 rounded-full bg-rose/10 blur-3xl" />

      <header className="relative flex items-center justify-between px-4 pt-4">
        <Link to="/" className="flex items-center gap-2 tap">
          <div className="grid size-9 place-items-center rounded-xl bg-accent/90 font-display text-lg font-bold text-ink shadow-lg shadow-accent/30">
            P
          </div>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-bold tracking-tight">{title ?? "Prosegur Field"}</p>
            <p className="text-[10px] tracking-[0.2em] text-steel uppercase">Operação de Campo</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <div className="glass-soft flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-mist">
            <span className="size-1.5 rounded-full bg-mint" /> Offline
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            className="glass-soft grid size-9 place-items-center rounded-xl text-lg leading-none text-steel tap"
          >
            ⋮
          </button>
        </div>
      </header>

      <main className="relative px-4 pt-4 pb-28">{children}</main>

      <BottomNav />

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <div className="flex flex-col gap-2">
          <MenuButton onClick={() => fileRef.current?.click()} disabled={busy} label="Importar Excel" hint="Lê todas as folhas e junta aos dados atuais" />
          <MenuButton onClick={onExport} disabled={busy} label="Exportar Excel" hint="Ficheiro original + colunas de status" />
          <MenuButton onClick={onClear} disabled={busy} label="Apagar dados" hint="Remove tudo deste telemóvel" danger />
        </div>
        {importedFileName && (
          <p className="mt-4 text-center text-[11px] text-steel">
            Ficheiro: <span className="text-mist">{importedFileName}</span> · {clients.length} clientes
          </p>
        )}
      </Sheet>
    </div>
  );
}

function MenuButton({
  label,
  hint,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`glass-soft flex w-full flex-col items-start rounded-xl px-4 py-3.5 text-left tap disabled:opacity-50 ${danger ? "text-rose" : "text-mist"}`}
    >
      <span className="font-display text-[15px] font-semibold">{label}</span>
      <span className="text-[11px] text-steel">{hint}</span>
    </button>
  );
}

function BottomNav() {
  const item = "rounded-xl py-2.5 text-center text-[11px] font-semibold text-steel tap";
  const active = { className: `${item} bg-accent text-ink` };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md px-4 pb-4">
      <div className="glass grid grid-cols-4 gap-1.5 rounded-2xl p-1.5">
        <Link to="/" className={item} activeProps={active} activeOptions={{ exact: true }}>
          Início
        </Link>
        <Link to="/agendados" className={item} activeProps={active}>
          Agend.
        </Link>
        <Link to="/clientes" className={item} activeProps={active}>
          Lista
        </Link>
        <Link to="/exportar" className={item} activeProps={active}>
          Exportar
        </Link>
      </div>
    </nav>
  );
}
