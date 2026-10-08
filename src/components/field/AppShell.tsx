import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useFieldStore, dedupeClients, AUTO_NOTE } from "@/lib/store";
import { parseWorkbook, saveOriginalFile, exportWorkbook } from "@/lib/excel";
import { Sheet } from "./Sheet";
import { Maximize, Minimize } from "lucide-react";

export function AppShell({ children, title, hideNav, back }: { children: ReactNode; title?: string; hideNav?: boolean; back?: boolean }) {
  const { hydrated, setHydrated } = useFieldStore();
  const clients = useFieldStore((s) => s.clients);
  const importedFileName = useFieldStore((s) => s.importedFileName);
  const [menuOpen, setMenuOpen] = useState(false);
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null);
  const applyingUpdate = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsSupported, setFsSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated) return;
    void Promise.resolve(useFieldStore.persist.rehydrate()).then(() => {
      // Repair duplicates saved by older versions: one client = one record.
      const cur = useFieldStore.getState().clients;
      const clean = dedupeClients(cur).map((c) => ({
        ...c,
        history: c.history.filter((h) => h.note !== AUTO_NOTE),
      }));
      useFieldStore.setState({ clients: clean });
    });
    setHydrated();
  }, [hydrated, setHydrated]);

  // Offline support + "nova versão" notice. Never reloads by itself: only after the user taps "Atualizar".
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const onControllerChange = () => {
      if (applyingUpdate.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setUpdateWorker(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) setUpdateWorker(nw);
          });
        });
      })
      .catch(() => {});
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  // Tela cheia: um botão discreto, que vira "sair" enquanto estiver em tela cheia.
  useEffect(() => {
    const doc = document as Document & { fullscreenEnabled?: boolean };
    setFsSupported(!!doc.fullscreenEnabled && !!document.documentElement.requestFullscreen);
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // Enquanto estiver em tela cheia, mantém a tela acesa (Wake Lock). Libera ao sair.
  // O sistema solta o bloqueio quando a aba fica oculta, então ele é pedido de novo ao voltar.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = async () => {
      if (!fullscreen || !nav.wakeLock || document.visibilityState !== "visible") return;
      try {
        lock = await nav.wakeLock.request("screen");
      } catch {
        lock = null;
      }
    };
    const release = () => {
      void lock?.release().catch(() => {});
      lock = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    if (fullscreen) void acquire();
    else release();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [fullscreen]);

  useEffect(() => {
    const onErr = () =>
      toast.error("Armazenamento do telemóvel cheio", {
        description: "Os últimos registos podem não ter sido guardados. Exporta o Excel já.",
      });
    window.addEventListener("field-storage-error", onErr);
    return () => window.removeEventListener("field-storage-error", onErr);
  }, []);

  // Overdue schedules stay "scheduled" until rescheduled in /agendados (never back to pending).


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

      <header className="relative flex items-center justify-center px-4 pt-4">
        {back && (
          <button
            onClick={() => history.back()}
            aria-label="Voltar"
            className="glass-soft absolute left-4 grid size-9 place-items-center rounded-xl text-lg leading-none text-steel tap"
          >
            ←
          </button>
        )}
        <Link to="/" className="text-center tap">
          <p className="font-display text-[15px] leading-tight font-semibold tracking-[0.28em] uppercase">Field Connect</p>
          <p className="mt-0.5 text-[11px] tracking-[0.12em] text-steel">By L.A. Tech Braga</p>
        </Link>
        {fsSupported && (
          <button
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            className="glass-soft absolute right-16 grid size-9 place-items-center rounded-xl text-steel tap"
          >
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        )}
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Menu"
          className="glass-soft absolute right-4 grid size-9 place-items-center rounded-xl text-lg leading-none text-steel tap"
        >
          ⋮
        </button>
      </header>

      {title && (
        <div className="relative px-4 pt-3">
          <div className="glass-soft mx-auto w-fit rounded-full px-3 py-1 text-[11px] font-semibold text-mist">{title}</div>
        </div>
      )}

      {updateWorker && (
        <div className="relative mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3.5 py-2.5">
          <span className="text-[13px] text-mist">Nova versão disponível</span>
          <button
            onClick={() => {
              applyingUpdate.current = true;
              updateWorker.postMessage("SKIP_WAITING");
            }}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-ink tap"
          >
            Atualizar
          </button>
        </div>
      )}

      <main className="relative px-4 pt-3 pb-28">{children}</main>

      {!hideNav && <BottomNav />}

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
  const item = "flex min-h-12 flex-col items-center justify-center text-[12px] font-semibold text-steel tap";
  const active = { className: `${item} text-accent` };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-border bg-ink pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        <Link to="/" className={item} activeProps={active} activeOptions={{ exact: true }}>
          Início
        </Link>
        <Link to="/agendados" className={item} activeProps={active}>
          Agendados
        </Link>
        <Link to="/clientes" className={item} activeProps={active}>
          Clientes
        </Link>
        <Link to="/exportar" className={item} activeProps={active}>
          Exportar
        </Link>
      </div>
    </nav>
  );
}
