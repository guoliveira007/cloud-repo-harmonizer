import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ErrorAnalysis } from "@/components/ErrorAnalysis";
import { StudyPlanContent } from "@/components/StudyPlan";
import { supabase } from "@/integrations/supabase/client";
import { generateStudyPlan } from "@/lib/exams.functions";
import { formatDate, percent } from "@/lib/exam-utils";

export const Route = createFileRoute("/simulados/$id")({
  head: () => ({
    meta: [
      { title: "Correção do simulado — Fichário" },
      {
        name: "description",
        content: "Veja acertos, erros por matéria e a análise da IA para cada questão errada.",
      },
      { property: "og:title", content: "Correção do simulado" },
      {
        property: "og:description",
        content: "Desempenho por matéria e análise detalhada dos erros.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <ExamDetail />
    </AppShell>
  ),
});

function ExamDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const makePlan = useServerFn(generateStudyPlan);

  const exam = useQuery({
    queryKey: ["exam", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("exams").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const questions = useQuery({
    queryKey: ["exam-questions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_questions")
        .select("*")
        .eq("exam_id", id)
        .order("number");
      if (error) throw error;
      return data;
    },
  });

  const plan = useQuery({
    queryKey: ["exam-plan", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("study_plans")
        .select("id, content, created_at")
        .eq("exam_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const planMutation = useMutation({
    mutationFn: () => makePlan({ data: { examId: id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exam-plan", id] });
      toast.success("Plano de revisão atualizado.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao gerar o plano."),
  });

  const rows = questions.data ?? [];
  const wrong = rows.filter((q) => q.is_correct === false);

  const bySubject = new Map<string, { correct: number; total: number }>();
  for (const q of rows) {
    const key = q.subject ?? "Sem matéria";
    const entry = bySubject.get(key) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (q.is_correct) entry.correct += 1;
    bySubject.set(key, entry);
  }

  if (exam.isLoading) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>
    );
  }
  if (!exam.data) return <p className="text-sm text-ink-soft">Simulado não encontrado.</p>;

  return (
    <>
      <Link
        to="/simulados"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-sun-deep"
      >
        <ArrowLeft className="size-3.5" /> Simulados
      </Link>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{exam.data.title}</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
            {formatDate(exam.data.exam_date)}
            {exam.data.board ? ` · ${exam.data.board}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-bold text-sun-deep">
            {percent(exam.data.correct_count, exam.data.total_questions)}%
          </p>
          <p className="text-xs text-ink-soft">
            {exam.data.correct_count}/{exam.data.total_questions} acertos
          </p>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Desempenho por matéria</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...bySubject.entries()].map(([subject, stat]) => (
            <div key={subject} className="rounded-lg border border-line bg-card p-4">
              <p className="truncate text-sm font-medium">{subject}</p>
              <div className="mt-2 h-1.5 rounded-full bg-line">
                <div
                  className="h-1.5 rounded-full bg-sun"
                  style={{ width: `${percent(stat.correct, stat.total)}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-[11px] text-ink-soft">
                {stat.correct}/{stat.total} · {percent(stat.correct, stat.total)}%
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">
            Questões erradas ({wrong.length})
          </h2>
        </div>
        {wrong.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Nenhum erro registrado neste simulado.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {wrong.map((q) => (
              <WrongQuestion key={q.id} question={q} examId={id} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Plano de revisão</h2>
          <button
            onClick={() => planMutation.mutate()}
            disabled={planMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-line bg-card px-3 py-1.5 text-sm transition-colors hover:border-sun disabled:opacity-60"
          >
            {planMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4 text-sun-deep" />
            )}
            {plan.data ? "Gerar novamente" : "Gerar plano"}
          </button>
        </div>
        <div className="mt-4 rounded-xl border border-line bg-card p-6">
          {plan.data ? (
            <StudyPlanContent content={plan.data.content} />
          ) : (
            <p className="text-sm text-ink-soft">
              Gere um plano focado nos erros deste simulado.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

type QuestionRow = {
  id: string;
  number: number;
  subject_id?: string | null;
  subject: string | null;
  topic: string | null;
  statement: string | null;
  correct_answer: string | null;
  user_answer: string | null;
};

function WrongQuestion({ question, examId }: { question: QuestionRow; examId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const review = useQuery({
    queryKey: ["error-review", question.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("error_reviews")
        .select("id")
        .eq("question_id", question.id)
        .maybeSingle();
      return data;
    },
  });

  return (
    <div className="rounded-xl border border-line bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-destructive/10 font-mono text-xs font-bold text-destructive">
          {question.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {question.subject ?? "Sem matéria"}
            {question.topic ? ` · ${question.topic}` : ""}
          </span>
          {question.statement && (
            <span className="block truncate text-xs text-ink-soft">{question.statement}</span>
          )}
        </span>
        {review.data && (
          <span className="shrink-0 rounded-full bg-sun/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sun-deep">
            analisada
          </span>
        )}
        <span className="shrink-0 font-mono text-[11px] text-ink-soft">
          <span className="text-destructive">{question.user_answer ?? "—"}</span> →{" "}
          <span className="text-sun-deep">{question.correct_answer ?? "—"}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-4 py-4">
          <ErrorAnalysis
            question={question}
            onDone={() =>
              queryClient.invalidateQueries({ queryKey: ["exam-plan", examId] })
            }
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
