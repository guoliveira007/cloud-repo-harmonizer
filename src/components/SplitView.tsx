import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Maximize2, Minimize2, X } from "lucide-react";

import { PdfPane, type PdfTarget } from "@/components/PdfViewer";

type PanelItem = { kind: "pdf"; title: string; target: PdfTarget };

type ViewerApi = {
  item: PanelItem | null;
  /** true quando o painel ocupa a tela inteira */
  full: boolean;
  openPdf: (target: PdfTarget) => void;
  /** Abre o link da aula numa janela dedicada do navegador (pop-up). */
  openLesson: (lesson: { title: string; url: string; subtitle?: string }) => void;
  toggleFull: () => void;
  close: () => void;
};

const ViewerContext = createContext<ViewerApi | null>(null);

const STORAGE_KEY = "fichario:viewer";

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<PanelItem | null>(null);
  const [full, setFull] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // restaura o painel aberto (persistente entre páginas e recarregamentos)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { item?: PanelItem | null; full?: boolean };
        if (saved.item?.kind === "pdf") setItem(saved.item);
        if (saved.full) setFull(true);
      }
    } catch {
      /* ignora estado inválido */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (item) localStorage.setItem(STORAGE_KEY, JSON.stringify({ item, full }));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage indisponível */
    }
  }, [item, full, hydrated]);

  const openPdf = useCallback(
    (target: PdfTarget) => setItem({ kind: "pdf", title: target.title, target }),
    [],
  );

  const openLesson = useCallback((lesson: { title: string; url: string; subtitle?: string }) => {
    const width = Math.min(1280, Math.round(window.screen.availWidth * 0.6));
    const height = Math.round(window.screen.availHeight * 0.9);
    const left = window.screen.availWidth - width;
    // sem "noopener" aqui: com ele o navegador retorna null e o fallback abria uma 2ª janela
    const win = window.open(
      lesson.url,
      `aula-${lesson.title}`,
      `popup=yes,width=${width},height=${height},left=${left},top=0`,
    );
    if (win) {
      try {
        win.opener = null;
      } catch {
        /* cross-origin */
      }
      win.focus();
    }
  }, []);

  const toggleFull = useCallback(() => setFull((f) => !f), []);
  const close = useCallback(() => {
    setItem(null);
    setFull(false);
  }, []);

  const value = useMemo(
    () => ({ item, full, openPdf, openLesson, toggleFull, close }),
    [item, full, openPdf, openLesson, toggleFull, close],
  );

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useViewer precisa estar dentro de ViewerProvider");
  return ctx;
}

/** Painel do PDF: metade direita da tela ou tela inteira. */
export function SplitPanel() {
  const { item, full, toggleFull, close } = useViewer();
  if (!item) return null;

  return (
    <aside
      className={
        full
          ? "fixed inset-0 z-50 flex flex-col bg-card"
          : "fixed inset-0 z-40 flex flex-col border-l border-line bg-card lg:inset-y-0 lg:left-auto lg:right-0 lg:w-1/2"
      }
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</p>
        <button
          onClick={toggleFull}
          aria-label={full ? "Voltar para meia tela" : "Ocupar tela inteira"}
          title={full ? "Meia tela" : "Tela inteira"}
          className="text-ink-soft transition-colors hover:text-sun-deep"
        >
          {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button
          onClick={close}
          aria-label="Fechar painel"
          title="Fechar"
          className="text-ink-soft transition-colors hover:text-sun-deep"
        >
          <X className="size-4" />
        </button>
      </header>

      <PdfPane target={item.target} />
    </aside>
  );
}
