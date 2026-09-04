import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import {
  BookmarkPlus,
  ChevronRight,
  Cloud,
  FileText,
  Folder,
  FolderSymlink,
  Inbox,
  Loader2,
  Search,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { useViewer } from "@/components/SplitView";
import {
  listOneDriveFolder,
  resolveOneDriveShare,
  SHARED_FOLDER_URL,
  uploadOneDriveFile,
} from "@/lib/onedrive.functions";
import { fetchSubjects, formatSize, saveCloudMaterial, type Subject } from "@/lib/study";

export const Route = createFileRoute("/nuvem")({
  head: () => ({
    meta: [
      { title: "Nuvem OneDrive — Fichário" },
      {
        name: "description",
        content:
          "Navegue pelas pastas do seu OneDrive e abra seus materiais de estudo direto no Fichário.",
      },
      { property: "og:title", content: "Nuvem OneDrive — Fichário" },
      {
        property: "og:description",
        content: "Seus PDFs e documentos do OneDrive acessíveis dentro do fichário de estudos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <NuvemPage />
    </AppShell>
  ),
});

type SharedFolder = { driveId: string; itemId: string; name: string };

function NuvemPage() {
  const [path, setPath] = useState("");
  /** Pilha de pastas dentro do compartilhamento; vazia = navegando no próprio drive */
  const [sharedStack, setSharedStack] = useState<SharedFolder[]>([]);
  const [term, setTerm] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openPdf } = useViewer();
  const [saving, setSaving] = useState<{ id: string; name: string; size: number } | null>(null);
  const listFolder = useServerFn(listOneDriveFolder);
  const resolveShare = useServerFn(resolveOneDriveShare);
  const uploadFile = useServerFn(uploadOneDriveFile);
  const queryClient = useQueryClient();
  const { data: subjects = [] } = useQuery({ queryKey: ["subjects"], queryFn: fetchSubjects });

  const { data: shareRoot, isLoading: shareLoading } = useQuery({
    queryKey: ["onedrive-share", SHARED_FOLDER_URL],
    queryFn: () => resolveShare({ data: { shareUrl: SHARED_FOLDER_URL } }),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const inShared = sharedStack.length > 0;
  const currentShared = inShared ? sharedStack[sharedStack.length - 1] : null;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "onedrive",
      currentShared ? `share:${currentShared.driveId}:${currentShared.itemId}` : path,
    ],
    queryFn: () =>
      currentShared
        ? listFolder({
            data: {
              driveId: currentShared.driveId,
              itemId: currentShared.itemId,
              path: sharedStack.map((s) => s.name).join("/"),
            },
          })
        : listFolder({ data: { path } }),
  });

  const segments = path ? path.split("/") : [];
  const query = term.trim().toLowerCase();
  const items = (data?.items ?? []).filter((i) => i.name.toLowerCase().includes(query));

  function openItem(item: {
    id: string;
    name: string;
    isFolder: boolean;
    path: string;
    driveId: string | null;
  }) {
    if (item.isFolder) {
      if (currentShared) {
        setSharedStack((stack) => [
          ...stack,
          { driveId: currentShared.driveId, itemId: item.id, name: item.name },
        ]);
      } else {
        setPath(item.path);
      }
      setTerm("");
    } else {
      openPdf({ title: item.name, externalId: item.id, driveId: item.driveId });
    }
  }

  function openSharedRoot() {
    if (!shareRoot) return;
    setSharedStack([{ driveId: shareRoot.driveId, itemId: shareRoot.itemId, name: shareRoot.name }]);
    setPath("");
    setTerm("");
  }

  function goToMyDrive() {
    setSharedStack([]);
    setTerm("");
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
        reader.readAsDataURL(file);
      });
      const result = await uploadFile({
        data: {
          ...(currentShared
            ? { driveId: currentShared.driveId, itemId: currentShared.itemId }
            : { path }),
          fileName: file.name,
          contentBase64: base64,
          contentType: file.type || "application/octet-stream",
        },
      });
      toast.success(`"${result.name}" enviado para o OneDrive.`);
      queryClient.invalidateQueries({ queryKey: ["onedrive"] });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmSave(subjectId: string) {
    if (!saving) return;
    try {
      const result = await saveCloudMaterial({
        subject_id: subjectId,
        title: saving.name,
        external_id: saving.id,
        file_size: saving.size,
        topic: path ? path.split("/").pop() ?? null : null,
        tags: path ? path.split("/") : [],
      });
      toast.success(
        result === "exists"
          ? "Este arquivo já está nessa matéria."
          : "Arquivo salvo na biblioteca.",
      );
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      setSaving(null);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível salvar.");
    }
  }

  return (
    <>
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">OneDrive</p>
        <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-bold tracking-tight">
          <Cloud className="size-6 text-sun" /> Nuvem de estudos
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Navegue pelas pastas da sua conta Microsoft, suba arquivos e abra tudo sem sair do
          fichário.
        </p>
      </header>

      {shareRoot && !inShared && (
        <button
          onClick={openSharedRoot}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-left transition-colors hover:border-sun hover:bg-sun/10"
        >
          <FolderSymlink className="size-5 shrink-0 text-sun" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{shareRoot.name}</span>
            <span className="block text-xs text-ink-soft">
              Pasta compartilhada com você — toque para abrir
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-soft" />
        </button>
      )}
      {!shareRoot && shareLoading && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-xs text-ink-soft">
          <Loader2 className="size-3.5 animate-spin text-sun" /> Localizando pasta compartilhada…
        </div>
      )}

      <nav className="mt-4 flex flex-wrap items-center gap-1 text-sm">
        {inShared ? (
          <>
            <button
              onClick={goToMyDrive}
              className="rounded-md px-2 py-1 font-medium text-sun-deep hover:bg-sun/10"
            >
              Meu OneDrive
            </button>
            {sharedStack.map((seg, i) => (
              <span key={seg.itemId} className="flex items-center gap-1">
                <ChevronRight className="size-3.5 text-ink-soft" />
                <button
                  onClick={() => { setSharedStack(sharedStack.slice(0, i + 1)); setTerm(""); }}
                  className="rounded-md px-2 py-1 hover:bg-card"
                >
                  {seg.name}
                </button>
              </span>
            ))}
          </>
        ) : (
          <>
            <button
              onClick={() => { setPath(""); setTerm(""); }}
              className="rounded-md px-2 py-1 font-medium text-sun-deep hover:bg-sun/10"
            >
              Raiz
            </button>
            {segments.map((seg, i) => (
              <span key={`${seg}-${i}`} className="flex items-center gap-1">
                <ChevronRight className="size-3.5 text-ink-soft" />
                <button
                  onClick={() => { setPath(segments.slice(0, i + 1).join("/")); setTerm(""); }}
                  className="rounded-md px-2 py-1 hover:bg-card"
                >
                  {seg}
                </button>
              </span>
            ))}
          </>
        )}
      </nav>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
          <Search className="size-4 shrink-0 text-ink-soft" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar arquivos e pastas nesta pasta…"
            aria-label="Buscar arquivos e pastas"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-soft"
          />
          {term ? (
            <button
              onClick={() => setTerm("")}
              className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-sun-deep hover:underline"
            >
              limpar
            </button>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-sun px-3 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {uploading ? "Enviando…" : "Enviar"}
        </button>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-card p-5">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Loader2 className="size-5 animate-spin text-sun" />
            <p className="text-sm text-ink-soft">Carregando pasta…</p>
            <p className="text-xs text-ink-soft">Pastas grandes podem levar alguns segundos.</p>
          </div>
        ) : error ? (
          <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox className="size-5 text-ink-soft" />
            <p className="text-sm font-medium">
              {query ? "Nada encontrado para esta busca." : "Esta pasta está vazia."}
            </p>
            <p className="text-xs text-ink-soft">
              {query
                ? "Tente outro termo ou limpe a busca."
                : "Use o botão Enviar para subir o primeiro arquivo."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                {item.isFolder ? (
                  <Folder className="size-4 shrink-0 text-sun" />
                ) : (
                  <FileText className="size-4 shrink-0 text-ink-soft" />
                )}
                <button
                  onClick={() => openItem(item)}
                  className="min-w-0 flex-1 text-left text-sm font-medium hover:text-sun-deep"
                >
                  <span className="block truncate">{item.name}</span>
                </button>
                <span className="shrink-0 font-mono text-[11px] text-ink-soft">
                  {item.isFolder ? `${item.childCount} item(s)` : formatSize(item.size)}
                </span>
                {!item.isFolder && (
                  <button
                    onClick={() => setSaving({ id: item.id, name: item.name, size: item.size })}
                    aria-label={`Salvar ${item.name} na biblioteca`}
                    title="Salvar na biblioteca"
                    className="shrink-0 text-ink-soft transition-colors hover:text-sun-deep"
                  >
                    <BookmarkPlus className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {saving && (
        <SubjectPicker
          fileName={saving.name}
          subjects={subjects}
          onCancel={() => setSaving(null)}
          onPick={confirmSave}
        />
      )}
    </>
  );
}

function SubjectPicker({
  fileName,
  subjects,
  onPick,
  onCancel,
}: {
  fileName: string;
  subjects: Subject[];
  onPick: (subjectId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-line bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Salvar na biblioteca
            </p>
            <p className="mt-1 truncate text-sm font-semibold">{fileName}</p>
          </div>
          <button onClick={onCancel} aria-label="Cancelar" className="text-ink-soft hover:text-sun-deep">
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-4 text-sm text-ink-soft">Escolha a matéria:</p>
        {subjects.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Nenhuma matéria encontrada.</p>
        ) : (
          <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
            {subjects.map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm font-medium transition-colors hover:border-sun hover:bg-sun/10"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const denied = /401|403|permiss|unauthor|forbidden|configurada/i.test(message);
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ShieldAlert className="size-5 text-sun-deep" />
      <p className="text-sm font-medium">
        {denied
          ? "Sem permissão para acessar o OneDrive."
          : "Não foi possível carregar esta pasta."}
      </p>
      <p className="max-w-md text-xs text-ink-soft">
        {denied
          ? "A conexão com a sua conta Microsoft pode ter expirado ou não tem acesso a esta pasta. Reconecte o OneDrive e tente novamente."
          : message}
      </p>
      <button
        onClick={onRetry}
        className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-sun/10"
      >
        Tentar novamente
      </button>
    </div>
  );
}
