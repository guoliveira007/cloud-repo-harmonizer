import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, ExternalLink, Layers } from "lucide-react";

import { fetchReviewSources } from "@/lib/review-sources";

/** Seção "Revisar isso": resumo/aula/materiais do mesmo assunto da questão errada. */
export function ReviewSources({ questionId }: { questionId: string }) {
  const { data } = useQuery({
    queryKey: ["review-sources", questionId],
    queryFn: () => fetchReviewSources(questionId),
  });

  if (!data || !data.subjectId) return null;
  if (data.summaries.length === 0 && data.materials.length === 0) return null;

  const first = data.summaries[0];
  const fullLesson = data.conceptGap && first?.lesson_url ? first : null;

  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sun-deep">Revisar isso</p>

      {fullLesson ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-ink-soft">
            Você errou por não saber o conceito nas últimas tentativas deste assunto — reveja a aula
            completa, não só o resumo.
          </p>
          <a
            href={fullLesson.lesson_url!}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-sun px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ExternalLink className="size-4" />
            Assistir “{fullLesson.lesson_title ?? "aula completa"}”
          </a>
        </div>
      ) : (
        <ul className="mt-2 space-y-3">
          {data.summaries.map((s) => (
            <li key={s.id}>
              <p className="flex items-center gap-2 text-sm font-medium">
                <BookOpen className="size-4 text-sun-deep" />
                {s.lesson_title ?? "Resumo da aula"}
              </p>
              {s.summary && (
                <p className="mt-1 line-clamp-4 text-sm text-ink-soft">{s.summary.slice(0, 400)}</p>
              )}
              {s.lesson_url && (
                <a
                  href={s.lesson_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-sun-deep hover:underline"
                >
                  <ExternalLink className="size-3" /> abrir aula
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.materials.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.materials.map((m) => (
            <span
              key={m.id}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft"
            >
              {m.title}
            </span>
          ))}
        </div>
      )}

      <Link
        to="/flashcards"
        search={{ materia: data.subjectId }}
        className="mt-3 inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-sun"
      >
        <Layers className="size-4 text-sun-deep" />
        Ver flashcards desse assunto
      </Link>
    </div>
  );
}
