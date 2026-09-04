import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Eye,
  ListChecks,
  Loader2,
  PlayCircle,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { useServerFn } from "@tanstack/react-start";

import {
  generateFlashcardsFromMaterial,
  generateQuizFromMaterial,
} from "@/lib/ai-cards.functions";

import { AppShell } from "@/components/AppShell";
import { FlashcardReview } from "@/components/FlashcardReview";
import { useViewer } from "@/components/SplitView";
import { QuizRunner } from "@/components/QuizRunner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@tanstack/react-router";
import {
  childrenOf,
  fetchFlashcards,
  fetchMaterials,
  fetchQuestions,
  fetchSubjects,
  formatSize,
  materialLessonIds,
  relativeDate,
  scopeIds,
} from "@/lib/study";
import { lessonById, lessonLabel, lessonsForSubject } from "@/data/subject-map";
import { backfillExamSubjects } from "@/lib/exam-link";
import type { Lesson } from "@/data/types";
import { fetchWatchedLessons, setLessonWatched } from "@/lib/lessons";

export const Route = createFileRoute("/materia/$id")({
  head: () => ({
    meta: [
      { title: "Ficha da matéria — Fichário" },
      {
        name: "description",
        content: "Materiais em PDF, flashcards e quiz de uma matéria específica do seu fichário.",
      },
      { property: "og:title", content: "Ficha da matéria — Fichário" },
      {
        property: "og:description",
        content: "Materiais, flashcards e quiz reunidos em uma única ficha de estudo.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <MateriaPage />
    </AppShell>
  ),
});

type Tab = "materiais" | "aulas" | "flashcards" | "quiz" | "erros";

function MateriaPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("materiais");

  const { data: subjects = [] } = useQuery({ queryKey: ["subjects"], queryFn: fetchSubjects });
  const subject = subjects.find((s) => s.id === id);

  const frentes = childrenOf(subjects, id);
  const ids = scopeIds(subjects, id);
  const parent = subject?.parent_id ? subjects.find((s) => s.id === subject.parent_id) : undefined;

  const { data: allMaterials = [] } = useQuery({
    queryKey: ["materials", "all"],
    queryFn: () => fetchMaterials(),
  });
  const { data: allCards = [] } = useQuery({
    queryKey: ["flashcards", "all"],
    queryFn: () => fetchFlashcards(),
  });
  const { data: allQuestions = [] } = useQuery({
    queryKey: ["questions", "all"],
    queryFn: () => fetchQuestions(),
  });

  // Liga simulados antigos às matérias antes de listar os erros desta ficha.
  useQuery({
    queryKey: ["exam-backfill", subjects.length],
    queryFn: () => backfillExamSubjects(subjects),
    enabled: subjects.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: examErrors = [] } = useQuery({
    queryKey: ["exam-errors", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_questions")
        .select(
          "id, number, subject, topic, statement, correct_answer, user_answer, created_at, exams(title, exam_date), error_reviews(why_wrong, correct_reasoning, error_type, concept)",
        )
        .in("subject_id", ids)
        .eq("is_correct", false)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });



  const materials = allMaterials.filter((m) => ids.includes(m.subject_id));
  const cards = allCards.filter((c) => ids.includes(c.subject_id));
  const questions = allQuestions.filter((q) => ids.includes(q.subject_id));

  const lessons = lessonsForSubject(subject?.name ?? "", parent?.name);
  const { data: watched = [] } = useQuery({
    queryKey: ["lesson-progress"],
    queryFn: fetchWatchedLessons,
  });
  const watchedSet = new Set(watched);
  const watchedCount = lessons.filter((l) => watchedSet.has(l.id)).length;

  async function toggleLesson(lessonId: string, next: boolean) {
    try {
      await setLessonWatched(lessonId, next);
      queryClient.invalidateQueries({ queryKey: ["lesson-progress"] });
    } catch {
      toast.error("Não foi possível salvar a revisão.");
    }
  }



  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadLessons, setUploadLessons] = useState<string[]>([]);
  const { openPdf, openLesson } = useViewer();
  const [generating, setGenerating] = useState<string | null>(null);
  const generateFlashcards = useServerFn(generateFlashcardsFromMaterial);
  const generateQuiz = useServerFn(generateQuizFromMaterial);

  async function upload(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const path = `${user.id}/${id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("materiais").upload(path, file);
      if (error) throw error;
      const ext = file.name.split(".").pop()?.toUpperCase() ?? "DOC";
      await supabase.from("materials").insert({
        user_id: user.id,
        subject_id: id,
        title: file.name,
        file_path: path,
        file_size: file.size,
        kind: ext === "PDF" ? "PDF" : ext.slice(0, 4),
        lesson_id: uploadLessons[0] ?? null,
        lesson_ids: uploadLessons,
      });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast.success("Arquivo adicionado à ficha.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no envio do arquivo.");
    } finally {
      setUploading(false);
    }
  }

  function openMaterial(m: {
    title: string;
    file_path: string | null;
    external_id: string | null;
    link_url: string | null;
  }) {
    if (!m.file_path && !m.external_id && !m.link_url) {
      toast.error("Este material não tem arquivo.");
      return;
    }
    openPdf({
      title: m.title,
      path: m.file_path,
      url: m.external_id ? null : m.link_url,
      externalId: m.external_id,
    });
  }

  async function generateQuizFor(materialId: string) {
    if (generating) return;
    setGenerating(`quiz:${materialId}`);
    const toastId = toast.loading("Lendo o PDF e gerando questões…");
    try {
      const { created } = await generateQuiz({ data: { materialId } });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      toast.success(`${created} questões criadas nesta matéria.`, { id: toastId });
      setTab("quiz");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o quiz.", {
        id: toastId,
      });
    } finally {
      setGenerating(null);
    }
  }

  async function generateCards(materialId: string) {
    if (generating) return;
    setGenerating(`cards:${materialId}`);
    const toastId = toast.loading("Lendo o PDF e gerando flashcards…");
    try {
      const { created } = await generateFlashcards({ data: { materialId } });
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
      toast.success(`${created} flashcards criados nesta matéria.`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar os cartões.", {
        id: toastId,
      });
    } finally {
      setGenerating(null);
    }
  }

  async function setItemLesson(
    table: "materials" | "flashcards" | "quiz_questions",
    rowId: string,
    lessonId: string | null,
  ) {
    const { error } = await supabase.from(table).update({ lesson_id: lessonId }).eq("id", rowId);
    if (error) {
      toast.error("Não foi possível salvar a aula.");
      return;
    }
    queryClient.invalidateQueries({
      queryKey: [
        table === "materials" ? "materials" : table === "flashcards" ? "flashcards" : "questions",
      ],
    });
    queryClient.invalidateQueries({ queryKey: ["materials", "all"] });
    queryClient.invalidateQueries({ queryKey: ["flashcards", "all"] });
    queryClient.invalidateQueries({ queryKey: ["questions", "all"] });
  }

  /** Salva a lista de aulas de um material (um PDF pode ser de várias aulas). */
  async function setMaterialLessons(materialId: string, lessonIds: string[]) {
    const { error } = await supabase
      .from("materials")
      .update({ lesson_ids: lessonIds, lesson_id: lessonIds[0] ?? null })
      .eq("id", materialId);
    if (error) {
      toast.error("Não foi possível salvar as aulas.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["materials"] });
    queryClient.invalidateQueries({ queryKey: ["materials", "all"] });
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

  if (!subject) {
    return <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>;
  }

  return (
    <>
      {parent && (
        <Link
          to="/materia/$id"
          params={{ id: parent.id }}
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-sun-deep"
        >
          ← {parent.name}
        </Link>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: subject.color }} />
          <h1 className="font-display text-2xl font-bold tracking-tight">{subject.name}</h1>
          <span className="ml-1 font-mono text-[11px] text-ink-soft">
            {materials.length} materiais · {cards.length} cartões · {questions.length} questões
            {lessons.length > 0 ? ` · ${lessons.length} aulas` : ""}
            {frentes.length > 0 ? ` · ${frentes.length} frentes` : ""}
          </span>
        </div>

        <div className="flex gap-1 rounded-lg border border-line bg-card p-1 text-sm">
          {(
            [
              ["materiais", "Materiais"],
              ["aulas", "Aulas"],

              ["flashcards", "Flashcards"],
              ["quiz", "Quiz"],
              ["erros", "Erros"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={
                tab === key
                  ? "rounded-md bg-sun px-3 py-1.5 font-semibold text-primary-foreground"
                  : "rounded-md px-3 py-1.5 font-medium text-ink-soft"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {frentes.length > 0 && (
        <section className="mt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            Frentes desta matéria
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {frentes.map((f) => {
              const fMaterials = allMaterials.filter((m) => m.subject_id === f.id).length;
              const fCards = allCards.filter((c) => c.subject_id === f.id).length;
              const fQuestions = allQuestions.filter((q) => q.subject_id === f.id).length;
              return (
                <Link
                  key={f.id}
                  to="/materia/$id"
                  params={{ id: f.id }}
                  className="group relative rounded-xl border border-line bg-card p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_-18px_var(--sun-deep)]"
                >
                  <span
                    className="absolute -top-0.5 left-5 h-1.5 w-10 rounded-b-md"
                    style={{ background: f.color }}
                  />
                  <p className="font-display text-sm font-semibold">{f.name}</p>
                  <p className="mt-1 font-mono text-[10px] text-ink-soft">
                    {fMaterials} PDFs · {fCards} cards · {fQuestions} questões
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {tab === "aulas" && (
        <section className="mt-4 rounded-xl border border-line bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Aulas gravadas {parent ? `· ${subject.name}` : "· todas as frentes"}
            </p>
            <p className="font-mono text-[10px] text-ink-soft">
              {watchedCount}/{lessons.length} revisadas
            </p>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-sun"
              style={{
                width: `${lessons.length ? Math.round((watchedCount / lessons.length) * 100) : 0}%`,
              }}
            />
          </div>

          {lessons.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              Nenhuma aula gravada vinculada a esta matéria.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {lessons.map((l) => {
                const isWatched = watchedSet.has(l.id);
                return (
                  <li key={l.id} className="flex items-center gap-3 py-3">
                    <button
                      onClick={() => toggleLesson(l.id, !isWatched)}
                      aria-label={isWatched ? "Marcar como não revisada" : "Marcar como revisada"}
                      className={
                        isWatched
                          ? "grid size-6 shrink-0 place-items-center rounded-full bg-sun text-primary-foreground"
                          : "grid size-6 shrink-0 place-items-center rounded-full border border-line text-transparent transition-colors hover:border-sun"
                      }
                    >
                      <Check className="size-3.5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={
                          isWatched
                            ? "truncate text-sm text-ink-soft line-through"
                            : "truncate text-sm font-medium"
                        }
                      >
                        {l.title}
                      </p>
                      <p className="font-mono text-[10px] text-ink-soft">
                        {l.date} · {l.professor} · Frente {l.frente} ·{" "}
                        {materials.filter((m) => materialLessonIds(m).includes(l.id)).length}{" "}
                        materiais ·{" "}

                        {cards.filter((c) => c.lesson_id === l.id).length} cartões ·{" "}
                        {questions.filter((q) => q.lesson_id === l.id).length} questões
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
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}


      {tab === "materiais" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="rounded-xl border border-line bg-card p-5 lg:col-span-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                Biblioteca · arquivos
              </p>
              {frentes.length === 0 && (
                <div className="flex items-center gap-2">
                  <MultiLessonPicker
                    lessons={lessons}
                    values={uploadLessons}
                    onChange={setUploadLessons}
                  />

                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-md bg-sun px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-sun-deep disabled:opacity-50"
                >
                  <Upload className="size-3.5" />
                  {uploading ? "Enviando…" : "Enviar PDF"}
                </button>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                  e.target.value = "";
                }}
              />
            </div>

            {frentes.length > 0 && (
              <p className="mt-3 rounded-md border border-dashed border-line px-3 py-2 text-xs text-ink-soft">
                Escolha uma frente acima para enviar arquivos. Aqui você vê tudo o que está em{" "}
                {subject.name}.
              </p>
            )}

            {materials.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">
                Envie os PDFs desta matéria para acessá-los de qualquer lugar.
              </p>
            ) : (

              <ul className="mt-3 divide-y divide-line">
                {materials.map((m) => (
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
                        {formatSize(m.file_size)} · {relativeDate(m.created_at)}
                      </p>
                      <LessonTags lessonIds={materialLessonIds(m)} />
                    </div>
                    <MultiLessonPicker
                      lessons={lessons}
                      values={materialLessonIds(m)}
                      onChange={(v) => setMaterialLessons(m.id, v)}
                    />

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
                      onClick={() => generateCards(m.id)}
                      disabled={generating !== null}
                      className="flex items-center gap-1 rounded-md border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-soft transition-colors hover:border-sun hover:text-sun-deep disabled:opacity-50"
                      title="Gerar flashcards com IA a partir deste PDF"
                    >
                      {generating === `cards:${m.id}` ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      Cartões
                    </button>
                    <button
                      onClick={() => generateQuizFor(m.id)}
                      disabled={generating !== null}
                      className="flex items-center gap-1 rounded-md border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-soft transition-colors hover:border-sun hover:text-sun-deep disabled:opacity-50"
                      title="Gerar questões de quiz com IA a partir deste PDF"
                    >
                      {generating === `quiz:${m.id}` ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ListChecks className="size-3.5" />
                      )}
                      Quiz
                    </button>
                    <button
                      onClick={() => openMaterial(m)}
                      className="flex items-center gap-1 rounded-md border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-soft transition-colors hover:border-sun hover:text-sun-deep"
                      title="Visualizar o PDF no painel"
                    >
                      <Eye className="size-3.5" />
                      Ver PDF
                    </button>
                    <button
                      onClick={() => removeMaterial(m.id, m.file_path)}
                      className="text-ink-soft transition-colors hover:text-destructive"
                      aria-label="Remover arquivo"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-2">
            <FlashcardReview cards={cards} subjectId={id} />
          </div>
        </div>
      )}

      {tab === "flashcards" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {frentes.length === 0 ? (
              <NewFlashcard subjectId={id} lessons={lessons} />
            ) : (
              <p className="rounded-xl border border-dashed border-line bg-card px-4 py-3 text-xs text-ink-soft">
                Abra uma frente de {subject.name} para criar cartões. Abaixo estão todos os cartões
                da matéria.
              </p>
            )}
            <div className="mt-4 rounded-xl border border-line bg-card p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                Todos os cartões
              </p>
              {cards.length === 0 ? (
                <p className="mt-4 text-sm text-ink-soft">Nenhum cartão criado ainda.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {cards.map((c) => (
                    <li key={c.id} className="flex items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.front}</p>
                        <p className="mt-0.5 text-sm text-ink-soft">{c.back}</p>
                        {c.subject_id !== id && (
                          <p className="mt-0.5 font-mono text-[10px] text-ink-soft">
                            {subjects.find((s) => s.id === c.subject_id)?.name}
                          </p>
                        )}
                        <LessonTag lessonId={c.lesson_id} />
                      </div>
                      <LessonPicker
                        lessons={lessons}
                        value={c.lesson_id}
                        onChange={(v) => setItemLesson("flashcards", c.id, v)}
                      />

                      <span className="shrink-0 rounded-full bg-sun/15 px-2 py-0.5 font-mono text-[10px] text-sun-deep">
                        caixa {c.box}
                      </span>
                      <button
                        onClick={async () => {
                          await supabase.from("flashcards").delete().eq("id", c.id);
                          queryClient.invalidateQueries({ queryKey: ["flashcards"] });
                        }}
                        className="shrink-0 text-ink-soft transition-colors hover:text-destructive"
                        aria-label="Remover cartão"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="lg:col-span-2">
            <FlashcardReview cards={cards} subjectId={id} />
          </div>
        </div>
      )}

      {tab === "quiz" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {frentes.length === 0 ? (
              <NewQuestion subjectId={id} lessons={lessons} />
            ) : (
              <p className="rounded-xl border border-dashed border-line bg-card px-4 py-3 text-xs text-ink-soft">
                Abra uma frente de {subject.name} para criar questões. O quiz ao lado reúne as
                questões de todas as frentes.
              </p>
            )}
            <div className="mt-4 rounded-xl border border-line bg-card p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                Todas as questões
              </p>
              {questions.length === 0 ? (
                <p className="mt-4 text-sm text-ink-soft">Nenhuma questão criada ainda.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {questions.map((q) => (
                    <li key={q.id} className="flex items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{q.question}</p>
                        <LessonTag lessonId={q.lesson_id} />
                      </div>
                      <LessonPicker
                        lessons={lessons}
                        value={q.lesson_id}
                        onChange={(v) => setItemLesson("quiz_questions", q.id, v)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="lg:col-span-2">
            <QuizRunner questions={questions} subjectId={id} />
          </div>
        </div>
      )}

      {tab === "erros" && (
        <section className="mt-4 rounded-xl border border-line bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Erros de simulado nesta matéria
            </p>
            <Link
              to="/simulados"
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-sun-deep hover:underline"
            >
              Ver simulados →
            </Link>
          </div>

          {examErrors.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              Nenhum erro registrado aqui ainda. Corrija um simulado para as questões erradas
              aparecerem nesta frente.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {examErrors.map((q) => {
                const review = q.error_reviews;
                return (
                  <li key={q.id} className="rounded-lg border border-line bg-paper p-4">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                      <span>Q{q.number}</span>
                      {q.exams?.title && <span>· {q.exams.title}</span>}
                      {q.topic && <span>· {q.topic}</span>}
                      {review?.error_type && (
                        <span className="rounded-full bg-sun/15 px-2 py-0.5 text-sun-deep">
                          {review.error_type}
                        </span>
                      )}
                    </div>
                    {q.statement && (
                      <p className="mt-2 line-clamp-3 text-sm text-ink">{q.statement}</p>
                    )}
                    <p className="mt-2 font-mono text-[11px] text-ink-soft">
                      Sua resposta: {q.user_answer ?? "—"} · Gabarito: {q.correct_answer ?? "—"}
                    </p>
                    {review?.why_wrong && (
                      <p className="mt-2 text-sm text-ink-soft">
                        <span className="font-semibold text-ink">Onde errei: </span>
                        {review.why_wrong}
                      </p>
                    )}
                    {review?.correct_reasoning && (
                      <p className="mt-1 text-sm text-ink-soft">{review.correct_reasoning}</p>
                    )}
                    {review?.concept && (
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-sun-deep">
                        Conceito: {review.concept}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>

  );
}

function NewFlashcard({ subjectId, lessons }: { subjectId: string; lessons: Lesson[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [lessonId, setLessonId] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !front.trim() || !back.trim()) return;
    const { error } = await supabase
      .from("flashcards")
      .insert({ user_id: user.id, subject_id: subjectId, front, back, lesson_id: lessonId });
    if (error) {
      toast.error("Não foi possível criar o cartão.");
      return;
    }
    setFront("");
    setBack("");
    queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    toast.success("Cartão criado.");
  }

  return (
    <form onSubmit={add} className="rounded-xl border border-line bg-card p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        Novo flashcard
      </p>
      <input
        value={front}
        onChange={(e) => setFront(e.target.value)}
        placeholder="Pergunta"
        className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sun"
      />
      <input
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder="Resposta"
        className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sun"
      />
      <div className="mt-2">
        <LessonPicker lessons={lessons} value={lessonId} onChange={setLessonId} />
      </div>
      <button className="mt-3 flex items-center gap-1.5 rounded-lg bg-sun px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-sun-deep">
        <Plus className="size-4" /> Adicionar cartão
      </button>
    </form>
  );
}

function NewQuestion({ subjectId, lessons }: { subjectId: string; lessons: Lesson[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [lessonId, setLessonId] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const filled = options.map((o) => o.trim()).filter(Boolean);
    if (!user || !question.trim() || filled.length < 2) {
      toast.error("Escreva a pergunta e ao menos duas alternativas.");
      return;
    }
    const { error } = await supabase.from("quiz_questions").insert({
      user_id: user.id,
      subject_id: subjectId,
      question,
      options: filled,
      correct_index: Math.min(correct, filled.length - 1),
      explanation: explanation || null,
      lesson_id: lessonId,
    });
    if (error) {
      toast.error("Não foi possível criar a questão.");
      return;
    }
    setQuestion("");
    setOptions(["", "", "", ""]);
    setCorrect(0);
    setExplanation("");
    queryClient.invalidateQueries({ queryKey: ["questions"] });
    toast.success("Questão adicionada.");
  }

  return (
    <form onSubmit={add} className="rounded-xl border border-line bg-card p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        Nova questão de quiz
      </p>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Enunciado da questão"
        rows={2}
        className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sun"
      />
      <div className="mt-2 space-y-2">
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCorrect(i)}
              className={
                correct === i
                  ? "grid size-6 shrink-0 place-items-center rounded-full bg-sun font-mono text-[10px] text-primary-foreground"
                  : "grid size-6 shrink-0 place-items-center rounded-full border border-line font-mono text-[10px] text-ink-soft"
              }
              aria-label={`Marcar alternativa ${String.fromCharCode(65 + i)} como correta`}
            >
              {String.fromCharCode(65 + i)}
            </button>
            <input
              value={option}
              onChange={(e) =>
                setOptions(options.map((o, idx) => (idx === i ? e.target.value : o)))
              }
              placeholder={`Alternativa ${String.fromCharCode(65 + i)}`}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sun"
            />
          </div>
        ))}
      </div>
      <input
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        placeholder="Explicação (opcional)"
        className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sun"
      />
      <div className="mt-2">
        <LessonPicker lessons={lessons} value={lessonId} onChange={setLessonId} />
      </div>
      <button className="mt-3 flex items-center gap-1.5 rounded-lg bg-sun px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-sun-deep">
        <Plus className="size-4" /> Adicionar questão
      </button>
    </form>
  );
}


/** Seletor compacto para dizer de qual aula é um material, cartão ou questão. */
function LessonPicker({
  lessons,
  value,
  onChange,
}: {
  lessons: Lesson[];
  value: string | null;
  onChange: (lessonId: string | null) => void;
}) {
  if (lessons.length === 0) return null;
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      title="Aula correspondente"
      className="max-w-[13rem] shrink-0 truncate rounded-md border border-line bg-paper px-2 py-1 font-mono text-[10px] text-ink-soft outline-none focus:border-sun"
    >
      <option value="">sem aula</option>
      {lessons.map((l) => (
        <option key={l.id} value={l.id}>
          {lessonLabel(l)}
        </option>
      ))}
    </select>
  );
}

/** Etiqueta somente-leitura da aula vinculada. */
function LessonTag({ lessonId }: { lessonId: string | null }) {
  const lesson = lessonById(lessonId);
  if (!lesson) return null;
  return (
    <span className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-sun/10 px-2 py-0.5 font-mono text-[9px] text-sun-deep">
      <PlayCircle className="size-3 shrink-0" />
      <span className="truncate">{lessonLabel(lesson)}</span>
    </span>
  );
}

/** Seletor de várias aulas para um mesmo material. */
function MultiLessonPicker({
  lessons,
  values,
  onChange,
}: {
  lessons: Lesson[];
  values: string[];
  onChange: (lessonIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  if (lessons.length === 0) return null;

  function toggle(lessonId: string) {
    onChange(
      values.includes(lessonId) ? values.filter((v) => v !== lessonId) : [...values, lessonId],
    );
  }

  const label =
    values.length === 0
      ? "sem aula"
      : values.length === 1
        ? (lessonById(values[0]) ? lessonLabel(lessonById(values[0])!) : "1 aula")
        : `${values.length} aulas`;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Aulas correspondentes"
        className="max-w-[13rem] truncate rounded-md border border-line bg-paper px-2 py-1 font-mono text-[10px] text-ink-soft outline-none transition-colors hover:border-sun"
      >
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 max-h-64 w-72 overflow-auto rounded-md border border-line bg-card p-2 shadow-lg">
            {values.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mb-1 w-full rounded px-2 py-1 text-left font-mono text-[10px] text-ink-soft hover:text-sun-deep"
              >
                limpar aulas
              </button>
            )}
            {lessons.map((l) => (
              <label
                key={l.id}
                className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-[11px] hover:bg-sun/10"
              >
                <input
                  type="checkbox"
                  checked={values.includes(l.id)}
                  onChange={() => toggle(l.id)}
                  className="mt-0.5 accent-current"
                />
                <span className="min-w-0 flex-1">{lessonLabel(l)}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Etiquetas somente-leitura das aulas vinculadas. */
function LessonTags({ lessonIds }: { lessonIds: string[] }) {
  const found = lessonIds.map((lid) => lessonById(lid)).filter(Boolean);
  if (found.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {found.map((lesson) => (
        <span
          key={lesson!.id}
          className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-sun/10 px-2 py-0.5 font-mono text-[9px] text-sun-deep"
        >
          <PlayCircle className="size-3 shrink-0" />
          <span className="truncate">{lessonLabel(lesson!)}</span>
        </span>
      ))}
    </span>
  );
}
