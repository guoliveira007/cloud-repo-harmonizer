import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, FileUp, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/AppShell";
import { useViewer } from "@/components/SplitView";
import { normalizeText } from "@/lib/lessons";
import { generateFromEdital } from "@/lib/edital.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMaterials,
  fetchSubjects,
  formatSize,
  relativeDate,
  scopeIds,
  subjectTree,
  materialLessonIds,
} from "@/lib/study";
import { lessonById, lessonLabel } from "@/data/subject-map";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca — Fichário" },
      {
        name: "description",
        content: "Acesse todos os seus PDFs e materiais de estudo organizados por matéria.",
      },
      { property: "og:title", content: "Biblioteca — Fichário" },
      {
        property: "og:description",
        content: "Todos os PDFs e materiais do seu fichário em um só lugar.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <BibliotecaPage />
    </AppShell>
  ),
});

function BibliotecaPage() {
  const queryClient = useQueryClient();
  const { data: subjects = [] } = useQuery({ queryKey: ["subjects"], queryFn: fetchSubjects });
  const { data: materials = [] } = useQuery({
    queryKey: ["materials", "all"],
    queryFn: () => fetchMaterials(),
  });
  const { openPdf } = useViewer();
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("todas");
  const [status, setStatus] = useState<"todos" | "lidos" | "pendentes">("todos");

  const tree = useMemo(() => subjectTree(subjects), [subjects]);

  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    const ids = subjectFilter === "todas" ? null : scopeIds(subjects, subjectFilter);
    return materials.filter((m) => {
      if (ids && !ids.includes(m.subject_id)) return false;
      if (status === "lidos" && !m.read) return false;
      if (status === "pendentes" && m.read) return false;
      if (
        q &&
        !normalizeText(
          [m.title, m.topic ?? "", m.course ?? "", (m.tags ?? []).join(" ")].join(" "),
        ).includes(q)
      )
        return false;
      return true;
    });
  }, [materials, subjects, query, subjectFilter, status]);


  const [editalSubject, setEditalSubject] = useState("");
  const [editalBusy, setEditalBusy] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const genFromEdital = useServerFn(generateFromEdital);

  async function uploadEdital(file: File) {
    if (!editalSubject) {
      toast.error("Escolha a matéria do edital.");
      return;
    }
    setEditalBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const path = `${uid}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upError } = await supabase.storage
        .from("materiais")
        .upload(path, file, { contentType: file.type || "application/pdf" });
      if (upError) throw upError;
      const { error } = await supabase.from("materials").insert({
        user_id: uid,
        subject_id: editalSubject,
        title: file.name.replace(/\.pdf$/i, ""),
        kind: "pdf",
        source: "upload",
        file_path: path,
        file_size: file.size,
        tags: ["edital"],
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast.success("Edital enviado. Agora gere questões inéditas a partir dele.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar o edital.");
    } finally {
      setEditalBusy(false);
    }
  }

  async function generateQuestions(materialId: string) {
    setGeneratingId(materialId);
    try {
      const result = await genFromEdital({ data: { materialId, count: 15 } });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      toast.success(`${result.created} questões inéditas geradas. Veja em Quizzes.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar questões.");
    } finally {
      setGeneratingId(null);
    }
  }

  async function toggleRead(materialId: string, read: boolean) {
    await supabase.from("materials").update({ read }).eq("id", materialId);
    queryClient.invalidateQueries({ queryKey: ["materials"] });
  }

  async function removeMaterial(materialId: string, path: string | null) {
    if (path) await supabase.storage.from("materiais").remove([path]);
    await supabase.from("materials").delete().eq("id", materialId);
    queryClient.invalidateQueries({ queryKey: ["materials"] });
  }

  return (
    <>
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">Arquivos</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Biblioteca</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {filtered.length} de {materials.length} material(is) · envie PDFs pela ficha de cada matéria
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título, tema, curso ou tag…"
          className="min-w-[220px] flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-sun"
        />
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm"
        >
          <option value="todas">Todas as matérias</option>
          {tree.map(({ subject: s, children }) =>
            children.length === 0 ? (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ) : (
              <optgroup key={s.id} label={s.name}>
                <option value={s.id}>{s.name} (tudo)</option>
                {children.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            ),
          )}

        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm"
        >
          <option value="todos">Todos</option>
          <option value="pendentes">Pendentes</option>
          <option value="lidos">Lidos</option>
        </select>
      </div>

      <section className="mt-5 rounded-xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <FileUp className="size-4 text-sun-deep" />
            <p className="font-display text-sm font-semibold">Edital → questões inéditas</p>
          </div>
          <select
            value={editalSubject}
            onChange={(e) => setEditalSubject(e.target.value)}
            className="rounded-md border border-line bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Matéria…</option>
            {subjects
              .filter((s) => !s.parent_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-sun ${editalBusy ? "pointer-events-none opacity-60" : ""}`}
          >
            {editalBusy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            Enviar edital (PDF)
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={editalBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadEdital(file);
                e.target.value = "";
              }}
            />
          </label>
          <p className="w-full text-xs text-ink-soft">
            Envie o edital ou conteúdo programático e gere questões novas sem repetir as que você
            já tem.
          </p>
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-line bg-card p-5">
        {filtered.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Nenhum arquivo encontrado. Vá até uma matéria para enviar seus PDFs ou ajuste os
            filtros.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((m) => {
              const subject = subjects.find((s) => s.id === m.subject_id);
              return (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-sun/15 font-mono text-[10px] font-medium text-sun-deep">
                    {m.kind}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      <span className="truncate">{m.title}</span>
                      {!m.file_path && (m.external_id || m.link_url) ? (
                        <span className="shrink-0 rounded-full bg-sun/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sun-deep">
                          nuvem
                        </span>
                      ) : null}
                    </p>
                    <p className="font-mono text-[10px] text-ink-soft">
                      {subject?.name ?? "—"} · {formatSize(m.file_size)} ·{" "}
                      {relativeDate(m.created_at)}
                      {m.topic ? ` · ${m.topic}` : ""}
                    </p>
                    {materialLessonIds(m).length > 0 && (
                      <p className="mt-0.5 font-mono text-[10px] text-sun-deep">
                        {materialLessonIds(m).length > 1 ? "aulas: " : "aula: "}
                        {materialLessonIds(m)
                          .map((lid) => lessonById(lid))
                          .filter(Boolean)
                          .map((l) => lessonLabel(l!))
                          .join(" · ")}
                      </p>
                    )}
                    {(m.tags ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(m.tags ?? []).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-sun/10 px-2 py-0.5 font-mono text-[9px] text-sun-deep"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {(m.tags ?? []).includes("edital") && m.file_path && (
                    <button
                      onClick={() => generateQuestions(m.id)}
                      disabled={generatingId === m.id}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sun px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {generatingId === m.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3" />
                      )}
                      Gerar questões
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 font-mono text-[10px] text-ink-soft">
                    <input
                      type="checkbox"
                      checked={m.read}
                      onChange={(e) => toggleRead(m.id, e.target.checked)}
                      className="accent-primary"
                    />
                    lido
                  </label>
                  <button
                    onClick={() =>
                      openPdf({
                        title: m.title,
                        path: m.file_path,
                        url: m.link_url,
                        externalId: m.external_id,
                      })
                    }
                    className="text-ink-soft transition-colors hover:text-sun-deep"
                    aria-label="Abrir arquivo"
                  >
                    <BookOpen className="size-4" />
                  </button>
                  <button
                    onClick={() => removeMaterial(m.id, m.file_path)}
                    className="text-ink-soft transition-colors hover:text-destructive"
                    aria-label="Remover arquivo"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
