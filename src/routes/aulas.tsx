import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, FileText, PlayCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useViewer } from "@/components/SplitView";
import { AppShell } from "@/components/AppShell";
import { LessonSummaryDialog } from "@/components/LessonSummaryDialog";
import { AddLessonDialog } from "@/components/AddLessonDialog";
import { subjects, professorColor } from "@/data/subjects";
import { supabase } from "@/integrations/supabase/client";
import { fetchWatchedLessons, setLessonWatched, normalizeText } from "@/lib/lessons";
import { fetchCustomLessons, deleteCustomLesson } from "@/lib/custom-lessons";


export const Route = createFileRoute("/aulas")({
  head: () => ({
    meta: [
      { title: "Aulas gravadas — Fichário" },
      {
        name: "description",
        content:
          "Catálogo completo das aulas gravadas por matéria, frente e professor, com controle de revisão.",
      },
      { property: "og:title", content: "Aulas gravadas — Fichário" },
      {
        property: "og:description",
        content: "Todas as aulas gravadas do ano organizadas por matéria e frente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <AulasPage />
    </AppShell>
  ),
});

function AulasPage() {
  const queryClient = useQueryClient();
  const { openLesson } = useViewer();
  const [subjectId, setSubjectId] = useState(subjects[0]!.id);
  const [professor, setProfessor] = useState("todos");
  const [frente, setFrente] = useState("todas");
  const [month, setMonth] = useState("todos");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [summaryLesson, setSummaryLesson] = useState<
    { id: string; title: string; subject?: string; frente?: string } | null
  >(null);


  const { data: summarized = [] } = useQuery({
    queryKey: ["lesson-summaries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lesson_summaries").select("lesson_id");
      if (error) throw error;
      return (data ?? []).map((r) => r.lesson_id);
    },
  });
  const summarizedSet = useMemo(() => new Set(summarized), [summarized]);

  const { data: customLessons = [] } = useQuery({
    queryKey: ["custom-lessons"],
    queryFn: fetchCustomLessons,
  });

  const baseSubject = subjects.find((s) => s.id === subjectId)!;

  const subject = useMemo(() => {
    const extras = customLessons.filter((l) => l.subject === subjectId);
    if (extras.length === 0) return baseSubject;
    const lessons = [...baseSubject.lessons, ...extras];
    return {
      ...baseSubject,
      lessons,
      professors: [...new Set(lessons.map((l) => l.professor))],
      months: [...new Set(lessons.map((l) => l.month))],
    };
  }, [baseSubject, customLessons, subjectId]);

  const customIds = useMemo(
    () => new Map(customLessons.map((l) => [l.id, l.rowId])),
    [customLessons],
  );

  const frentes = useMemo(
    () => [...new Set(subject.lessons.map((l) => l.frente))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [subject],
  );

  const { data: watched = [] } = useQuery({
    queryKey: ["lesson-progress"],
    queryFn: fetchWatchedLessons,
  });
  const watchedSet = useMemo(() => new Set(watched), [watched]);

  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    return subject.lessons.filter((l) => {
      if (professor !== "todos" && l.professor !== professor) return false;
      if (frente !== "todas" && l.frente !== frente) return false;
      if (month !== "todos" && l.month !== month) return false;
      if (q && !normalizeText(`${l.title} ${l.professor} ${l.frente}`).includes(q)) return false;
      return true;
    });
  }, [subject, professor, frente, month, query]);

  const done = subject.lessons.filter((l) => watchedSet.has(l.id)).length;
  const pct = subject.lessons.length ? Math.round((done / subject.lessons.length) * 100) : 0;

  async function toggle(lessonId: string, next: boolean) {
    try {
      await setLessonWatched(lessonId, next);
      queryClient.invalidateQueries({ queryKey: ["lesson-progress"] });
    } catch {
      toast.error("Não foi possível salvar a revisão.");
    }
  }

  async function removeCustom(rowId: string) {
    try {
      await deleteCustomLesson(rowId);
      queryClient.invalidateQueries({ queryKey: ["custom-lessons"] });
      toast.success("Aula removida.");
    } catch {
      toast.error("Não foi possível remover a aula.");
    }
  }


  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">Gravações</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Aulas</h1>
          <p className="mt-2 text-sm text-ink-soft">{subject.tagline}</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md bg-sun px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="size-4" /> adicionar aula
        </button>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        {subjects.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setSubjectId(s.id);
              setProfessor("todos");
              setFrente("todas");
              setMonth("todos");
            }}
            className={
              s.id === subjectId
                ? "rounded-md bg-sun px-3 py-1.5 text-sm font-semibold text-primary-foreground"
                : "rounded-md border border-line bg-card px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      <section className="mt-5 rounded-xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar aula…"
            className="min-w-[200px] flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-sun"
          />
          <select
            value={professor}
            onChange={(e) => setProfessor(e.target.value)}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            <option value="todos">Todos os professores</option>
            {subject.professors.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={frente}
            onChange={(e) => setFrente(e.target.value)}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            <option value="todas">Todas as frentes</option>
            {frentes.map((f) => (
              <option key={f} value={f}>
                {/^\d+$/.test(f) ? `Frente ${f}` : f}
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            <option value="todos">Todos os meses</option>
            {subject.months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-sun" style={{ width: `${pct}%` }} />
          </div>
          <p className="font-mono text-[10px] text-ink-soft">
            {done}/{subject.lessons.length} revisadas
          </p>
        </div>

        <ul className="mt-4 divide-y divide-line">
          {filtered.length === 0 && (
            <li className="py-6 text-sm text-ink-soft">Nenhuma aula encontrada com esses filtros.</li>
          )}
          {filtered.map((l) => {
            const isWatched = watchedSet.has(l.id);
            return (
              <li key={l.id} className="flex items-center gap-3 py-3">
                <button
                  onClick={() => toggle(l.id, !isWatched)}
                  aria-label={isWatched ? "Marcar como não revisada" : "Marcar como revisada"}
                  className={
                    isWatched
                      ? "grid size-6 shrink-0 place-items-center rounded-full bg-sun text-primary-foreground"
                      : "grid size-6 shrink-0 place-items-center rounded-full border border-line text-transparent transition-colors hover:border-sun"
                  }
                >
                  <Check className="size-3.5" />
                </button>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: professorColor(subject, l.professor) }}
                />
                <div className="min-w-0 flex-1">
                  <p className={isWatched ? "truncate text-sm text-ink-soft line-through" : "truncate text-sm font-medium"}>
                    {l.title}
                  </p>
                  <p className="font-mono text-[10px] text-ink-soft">
                    {l.date} · {l.professor} · Frente {l.frente}
                  </p>
                </div>
                <button
                  onClick={() =>
                    openLesson({
                      title: l.title,
                      url: l.url,
                      subtitle: `${l.professor} · ${l.date}`,
                    })
                  }
                  className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-ink-soft transition-colors hover:text-sun-deep"
                >
                  <PlayCircle className="size-3.5" /> abrir aula
                </button>
                <button
                  onClick={() =>
                    setSummaryLesson({
                      id: l.id,
                      title: l.title,
                      subject: subject.label,
                      frente: l.frente,
                    })
                  }

                  className={
                    summarizedSet.has(l.id)
                      ? "flex shrink-0 items-center gap-1 rounded-md border border-sun px-2.5 py-1.5 font-mono text-[11px] text-sun-deep"
                      : "flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-ink-soft transition-colors hover:text-sun-deep"
                  }
                >
                  <FileText className="size-3.5" />{" "}
                  {summarizedSet.has(l.id) ? "ver resumo" : "resumo"}
                </button>
                {customIds.has(l.id) && (
                  <button
                    onClick={() => removeCustom(customIds.get(l.id)!)}
                    aria-label="Remover aula adicionada"
                    className="shrink-0 rounded-md border border-line p-1.5 text-ink-soft transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}

              </li>
            );
          })}
        </ul>
      </section>

      <AddLessonDialog open={adding} onOpenChange={setAdding} defaultSubject={subjectId} />

      <LessonSummaryDialog
        lesson={summaryLesson}
        onOpenChange={(open) => !open && setSummaryLesson(null)}
      />
    </>

  );
}
