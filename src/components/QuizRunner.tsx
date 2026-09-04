import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { logSession, type QuizQuestion } from "@/lib/study";

export function QuizRunner({
  questions,
  subjectId,
}: {
  questions: QuizQuestion[];
  subjectId?: string | null;
}) {
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  }, [questions.length, subjectId]);

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-card p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">Quiz</p>
        <p className="mt-4 text-sm text-ink-soft">
          Nenhuma questão cadastrada ainda. Adicione questões na página da matéria.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border border-line bg-card p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          Resultado do quiz
        </p>
        <p className="mt-3 font-display text-4xl font-bold">
          {score}
          <span className="text-ink-soft">/{questions.length}</span>
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {Math.round((score / questions.length) * 100)}% de acerto.
        </p>
        <button
          onClick={() => {
            setIndex(0);
            setScore(0);
            setPicked(null);
            setDone(false);
          }}
          className="mt-4 rounded-lg bg-sun px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-sun-deep"
        >
          Refazer quiz
        </button>
      </div>
    );
  }

  const q = questions[index]!;

  async function next() {
    const correct = picked === q.correct_index;
    const newScore = score + (correct ? 1 : 0);
    if (index + 1 >= questions.length) {
      setScore(newScore);
      setDone(true);
      await logSession({
        subject_id: subjectId ?? q.subject_id,
        correct: newScore,
        total: questions.length,
        minutes: Math.max(1, Math.round(questions.length * 0.75)),
      });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      return;
    }
    setScore(newScore);
    setIndex(index + 1);
    setPicked(null);
  }

  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">Quiz</p>
        <span className="font-mono text-[11px] text-ink-soft">
          {index + 1} / {questions.length}
        </span>
      </div>

      <p className="mt-3 font-display text-base font-semibold leading-snug">{q.question}</p>

      <div className="mt-4 space-y-2">
        {q.options.map((option, i) => {
          const isPicked = picked === i;
          const isCorrect = i === q.correct_index;
          const revealed = picked !== null;
          let cls = "border-line bg-paper text-ink";
          if (revealed && isCorrect) cls = "border-sun bg-sun/15 text-sun-deep";
          else if (revealed && isPicked) cls = "border-destructive/60 bg-destructive/10 text-ink";
          return (
            <button
              key={i}
              disabled={revealed}
              onClick={() => setPicked(i)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${cls}`}
            >
              <span className="font-mono text-[11px] text-ink-soft">
                {String.fromCharCode(65 + i)}
              </span>
              {option}
            </button>
          );
        })}
      </div>

      {picked !== null && q.explanation && (
        <p className="mt-3 rounded-lg border border-line bg-paper p-3 text-sm text-ink-soft">
          {q.explanation}
        </p>
      )}

      <button
        disabled={picked === null}
        onClick={next}
        className="mt-4 w-full rounded-lg bg-sun px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-sun-deep disabled:opacity-40"
      >
        {index + 1 >= questions.length ? "Ver resultado" : "Próxima"}
      </button>
    </div>
  );
}
