import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { QuizRunner } from "@/components/QuizRunner";
import { fetchQuestions, fetchSubjects, scopeIds, subjectTree } from "@/lib/study";

export const Route = createFileRoute("/quizzes")({
  head: () => ({
    meta: [
      { title: "Quizzes — Fichário" },
      {
        name: "description",
        content: "Teste seus conhecimentos com quizzes de todas as suas matérias.",
      },
      { property: "og:title", content: "Quizzes — Fichário" },
      {
        property: "og:description",
        content: "Quiz com todas as questões cadastradas no seu fichário.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <QuizzesPage />
    </AppShell>
  ),
});

function QuizzesPage() {
  const { data: subjects = [] } = useQuery({ queryKey: ["subjects"], queryFn: fetchSubjects });
  const { data: questions = [] } = useQuery({
    queryKey: ["questions", "all"],
    queryFn: () => fetchQuestions(),
  });

  const tree = subjectTree(subjects);
  const bySubject = tree.map(({ subject, children }) => {
    const ids = scopeIds(subjects, subject.id);
    return {
      subject,
      count: questions.filter((q) => ids.includes(q.subject_id)).length,
      children: children.map((f) => ({
        subject: f,
        count: questions.filter((q) => q.subject_id === f.id).length,
      })),
    };
  });

  return (
    <>
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">Teste</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Quizzes</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {questions.length} questão(ões) · {tree.length} matérias
        </p>
      </header>


      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <QuizRunner questions={questions} />
        </div>
        <div className="rounded-xl border border-line bg-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            Questões por matéria
          </p>
          <ul className="mt-3 divide-y divide-line">
            {bySubject.map(({ subject, count, children }) =>
              count === 0 ? null : (
                <li key={subject.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: subject.color }} />
                      {subject.name}
                    </span>
                    <span className="font-mono text-[11px] text-ink-soft">{count}</span>
                  </div>
                  {children.map(({ subject: f, count: fCount }) =>
                    fCount === 0 ? null : (
                      <div
                        key={f.id}
                        className="mt-1 flex items-center justify-between pl-4 text-[13px] text-ink-soft"
                      >
                        <span>{f.name.replace(/^.*\(/, "").replace(/\)$/, "")}</span>
                        <span className="font-mono text-[10px]">{fCount}</span>
                      </div>
                    ),
                  )}
                </li>
              ),
            )}
          </ul>

        </div>
      </section>
    </>
  );
}
