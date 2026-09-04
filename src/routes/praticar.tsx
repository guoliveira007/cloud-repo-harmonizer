import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Check, Loader2, Play, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { fetchSubjects, logSession, scopeIds, subjectTree } from "@/lib/study";
import {
  BANK_STATUS,
  ERROR_KINDS,
  pickNextPractice,
  PRACTICE_STATUS,
  type ErrorKind,
  type PracticePoolQuestion,
} from "@/lib/practice";
import { percent } from "@/lib/exam-utils";

export const Route = createFileRoute("/praticar")({
  head: () => ({
    meta: [
      { title: "Praticar questões — Fichário" },
      {
        name: "description",
        content: "Sessão rápida de questões do seu banco, adaptada ao seu último tipo de erro.",
      },
      { property: "og:title", content: "Praticar questões — Fichário" },
      {
        property: "og:description",
        content: "A próxima questão é escolhida pelo tipo de erro que você acabou de cometer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <PraticarPage />
    </AppShell>
  ),
});

type ServedAnswer = {
  cloneId: string;
  answer: string;
  correct: boolean;
  kind: ErrorKind | null;
};

function PraticarPage() {
  const queryClient = useQueryClient();
  const { data: subjects = [] } = useQuery({ queryKey: ["subjects"], queryFn: fetchSubjects });

  const [subjectId, setSubjectId] = useState("todas");
  const [count, setCount] = useState(10);
  const [starting, setStarting] = useState(false);

  const [examId, setExamId] = useState<string | null>(null);
  const [pool, setPool] = useState<PracticePoolQuestion[]>([]);
  const [current, setCurrent] = useState<PracticePoolQuestion | null>(null);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [kind, setKind] = useState<ErrorKind | null>(null);
  const [answers, setAnswers] = useState<ServedAnswer[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState<{ correct: number; total: number } | null>(null);

  const tree = subjectTree(subjects);
  const letters = (q: PracticePoolQuestion) => Object.keys(q.options).sort();

  async function start() {
    setStarting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada.");

      // Pool: questões com enunciado do banco e de simulados já corrigidos.
      const { data: examRows, error: examsError } = await supabase
        .from("exams")
        .select("id")
        .in("status", [BANK_STATUS, "corrigido"]);
      if (examsError) throw examsError;
      const examIds = (examRows ?? []).map((e) => e.id);
      if (examIds.length === 0)
        throw new Error("Nenhuma questão no banco ainda. Corrija um simulado ou envie um banco.");

      const { data: questionRows, error: qError } = await supabase
        .from("exam_questions")
        .select("id, subject_id, subject, topic, statement, options, correct_answer")
        .in("exam_id", examIds)
        .not("statement", "is", null)
        .not("correct_answer", "is", null)
        .limit(500);
      if (qError) throw qError;

      const ids = subjectId === "todas" ? null : scopeIds(subjects, subjectId);
      let poolAll = (questionRows ?? [])
        .filter((q) => q.statement && q.correct_answer && q.options)
        .filter((q) => !ids || (q.subject_id && ids.includes(q.subject_id)))
        .map((q) => ({
          id: q.id,
          subject_id: q.subject_id,
          subject: q.subject,
          topic: q.topic,
          statement: q.statement!,
          options: q.options as Record<string, string>,
          correct_answer: q.correct_answer!,
        }));
      // embaralha
      poolAll = poolAll.sort(() => Math.random() - 0.5);
      if (poolAll.length === 0)
        throw new Error("Não encontrei questões com enunciado para essa matéria.");

      const poolSize = Math.min(poolAll.length, count * 2);
      const selected = poolAll.slice(0, poolSize);

      const { data: exam, error: examError } = await supabase
        .from("exams")
        .insert({
          user_id: uid,
          title: `Prática ${new Date().toLocaleDateString("pt-BR")}`,
          exam_date: new Date().toISOString().slice(0, 10),
          status: PRACTICE_STATUS,
          total_questions: 0,
          correct_count: 0,
          subject_id: subjectId === "todas" ? null : subjectId,
        })
        .select("id")
        .single();
      if (examError) throw examError;

      const clones = selected.map((q, i) => ({
        user_id: uid,
        exam_id: exam.id,
        number: i + 1,
        subject: q.subject,
        subject_id: q.subject_id,
        topic: q.topic,
        statement: q.statement,
        options: q.options,
        correct_answer: q.correct_answer,
        user_answer: null,
        is_correct: null,
      }));
      const { data: inserted, error: cloneError } = await supabase
        .from("exam_questions")
        .insert(clones)
        .select("id");
      if (cloneError) throw cloneError;

      // Pool passa a apontar para as cópias (onde as respostas serão gravadas).
      const clonedPool: PracticePoolQuestion[] = selected.map((q, i) => ({
        ...q,
        id: inserted![i]!.id,
      }));

      const first = clonedPool[0]!;
      setExamId(exam.id);
      setPool(clonedPool);
      setUsed(new Set([first.id]));
      setCurrent(first);
      setPicked(null);
      setKind(null);
      setAnswers([]);
      setDone(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível montar a prática.");
    } finally {
      setStarting(false);
    }
  }

  function answer(letter: string) {
    if (!current || picked) return;
    setPicked(letter);
    setKind(null);
  }

  function next() {
    if (!current || !picked) return;
    const correct = picked === current.correct_answer;
    const entry: ServedAnswer = { cloneId: current.id, answer: picked, correct, kind };
    const nextAnswers = [...answers, entry];

    if (nextAnswers.length >= count) {
      void finish(nextAnswers);
      return;
    }
    const nxt = pickNextPractice(pool, used, {
      kind: correct ? null : kind,
      subjectId: current.subject_id,
      topic: current.topic,
    });
    if (!nxt) {
      void finish(nextAnswers);
      return;
    }
    setAnswers(nextAnswers);
    setUsed(new Set([...used, nxt.id]));
    setCurrent(nxt);
    setPicked(null);
    setKind(null);
  }

  async function finish(finalAnswers: ServedAnswer[]) {
    if (!examId) return;
    setFinishing(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;

      for (const a of finalAnswers) {
        await supabase
          .from("exam_questions")
          .update({ user_answer: a.answer, is_correct: a.correct })
          .eq("id", a.cloneId);
        if (!a.correct && uid) {
          await supabase.from("error_reviews").upsert(
            {
              question_id: a.cloneId,
              user_id: uid,
              error_type: a.kind ?? "nao_sabia_conceito",
            },
            { onConflict: "question_id" },
          );
        }
      }

      const correct = finalAnswers.filter((a) => a.correct).length;
      await supabase
        .from("exams")
        .update({ total_questions: finalAnswers.length, correct_count: correct })
        .eq("id", examId);
      await logSession({ minutes: finalAnswers.length * 2, correct, total: finalAnswers.length });

      queryClient.invalidateQueries({ queryKey: ["exams"] });
      queryClient.invalidateQueries({ queryKey: ["revisoes"] });
      queryClient.invalidateQueries({ queryKey: ["subject-pending"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setAnswers(finalAnswers);
      setDone({ correct, total: finalAnswers.length });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a prática.");
    } finally {
      setFinishing(false);
    }
  }

  function reset() {
    setExamId(null);
    setPool([]);
    setCurrent(null);
    setUsed(new Set());
    setPicked(null);
    setKind(null);
    setAnswers([]);
    setDone(null);
  }

  // ---------- tela final ----------
  if (done) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">Prática</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Sessão concluída</h1>
        <p className="mt-6 font-display text-6xl font-bold text-sun-deep">
          {percent(done.correct, done.total)}%
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {done.correct}/{done.total} acertos
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-md bg-sun px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Nova sessão
          </button>
          {examId && (
            <Link
              to="/simulados/$id"
              params={{ id: examId }}
              className="rounded-md border border-line px-4 py-2 text-sm text-ink-soft transition-colors hover:border-sun"
            >
              Analisar erros desta sessão
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ---------- sessão em andamento ----------
  if (current) {
    const answered = picked !== null;
    const isCorrect = answered && picked === current.correct_answer;
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">
            Prática · questão {answers.length + 1} de {count}
          </p>
          <button
            onClick={() => void finish(answers)}
            disabled={finishing}
            className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-soft hover:text-sun-deep disabled:opacity-50"
          >
            encerrar
          </button>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-line">
          <div
            className="h-1.5 rounded-full bg-sun transition-all"
            style={{ width: `${(answers.length / count) * 100}%` }}
          />
        </div>

        <div className="mt-6 rounded-xl border border-line bg-card p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
            {current.subject ?? "Sem matéria"}
            {current.topic ? ` · ${current.topic}` : ""}
          </p>
          <p className="mt-3 text-sm leading-relaxed">{current.statement}</p>

          <div className="mt-5 space-y-2">
            {letters(current).map((letter) => {
              const isPicked = picked === letter;
              const isRight = letter === current.correct_answer;
              let cls =
                "flex w-full items-start gap-3 rounded-lg border border-line px-4 py-3 text-left text-sm transition-colors hover:border-sun";
              if (answered && isRight)
                cls =
                  "flex w-full items-start gap-3 rounded-lg border border-sun bg-sun/10 px-4 py-3 text-left text-sm";
              else if (answered && isPicked)
                cls =
                  "flex w-full items-start gap-3 rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-left text-sm";
              else if (answered)
                cls =
                  "flex w-full items-start gap-3 rounded-lg border border-line px-4 py-3 text-left text-sm opacity-60";
              return (
                <button key={letter} onClick={() => answer(letter)} disabled={answered} className={cls}>
                  <span className="font-mono text-xs font-bold">{letter}</span>
                  <span>{current.options[letter]}</span>
                </button>
              );
            })}
          </div>

          {answered && (
            <div className="mt-5 space-y-4 border-t border-line pt-4">
              <p className={`flex items-center gap-2 text-sm font-semibold ${isCorrect ? "text-sun-deep" : "text-destructive"}`}>
                {isCorrect ? <Check className="size-4" /> : <X className="size-4" />}
                {isCorrect ? "Resposta certa!" : `Era a alternativa ${current.correct_answer}.`}
              </p>

              {!isCorrect && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                    Por que você errou? (define a próxima questão)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ERROR_KINDS.map((k) => (
                      <button
                        key={k.id}
                        onClick={() => setKind(k.id)}
                        className={
                          kind === k.id
                            ? "rounded-full bg-sun px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                            : "rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-sun"
                        }
                        title={k.hint}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={next}
                disabled={(answered && !isCorrect && !kind) || finishing}
                className="inline-flex items-center gap-2 rounded-md bg-sun px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {finishing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                {answers.length + 1 >= count ? "Encerrar sessão" : "Próxima questão"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- configuração ----------
  return (
    <>
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">Treino</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Praticar</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Questões do seu banco em uma sessão rápida. A próxima questão se adapta ao tipo de erro
          que você acabou de cometer.
        </p>
      </header>

      <div className="mt-8 max-w-xl rounded-xl border border-line bg-card p-6">
        <label className="block text-sm">
          <span className="font-medium">Matéria</span>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-sun"
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
        </label>

        <div className="mt-4">
          <span className="text-sm font-medium">Quantidade</span>
          <div className="mt-2 flex gap-2">
            {[10, 20, 30].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={
                  count === n
                    ? "rounded-md bg-sun px-4 py-2 text-sm font-semibold text-primary-foreground"
                    : "rounded-md border border-line px-4 py-2 text-sm text-ink-soft transition-colors hover:border-sun"
                }
              >
                {n} questões
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={start}
          disabled={starting}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-sun px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {starting ? "Montando sua sessão…" : "Começar"}
        </button>
        <p className="mt-3 text-xs text-ink-soft">
          A sessão cria um exame com status “prática”, que não aparece na lista de simulados.
        </p>
      </div>
    </>
  );
}
