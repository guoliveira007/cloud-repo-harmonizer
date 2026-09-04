import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, Trash2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { useViewer } from "@/components/SplitView";
import { normalizeText } from "@/lib/lessons";
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
