import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { FlashcardReview } from "@/components/FlashcardReview";
import {
  fetchFlashcards,
  fetchSubjects,
  isDue,
  scopeIds,
  subjectTree,
  type Flashcard,
} from "@/lib/study";

export const Route = createFileRoute("/flashcards")({
  head: () => ({
    meta: [
      { title: "Flashcards — Fichário" },
      {
        name: "description",
        content: "Revise todos os seus flashcards de uma vez, agrupados por matéria.",
      },
      { property: "og:title", content: "Flashcards — Fichário" },
      {
        property: "og:description",
        content: "Revisão espaçada de flashcards para o ENEM e vestibulares.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <FlashcardsPage />
    </AppShell>
  ),
});

function boxStats(cards: Flashcard[]) {
  const buckets = [1, 2, 3, 4, 5, 6].map((box) => ({
    box,
    count: cards.filter((c) => Math.min(c.box, 6) === box).length,
  }));
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return { buckets, max };
}

function FlashcardsPage() {
  const { data: subjects = [] } = useQuery({ queryKey: ["subjects"], queryFn: fetchSubjects });
  const { data: cards = [] } = useQuery({
    queryKey: ["flashcards", "all"],
    queryFn: () => fetchFlashcards(),
  });
  const [filter, setFilter] = useState<string | null>(null);

  const subjectNames = useMemo(
    () =>
      Object.fromEntries(subjects.map((s) => [s.id, { name: s.name, color: s.color }])) as Record<
        string,
        { name: string; color: string }
      >,
    [subjects],
  );

  const tree = useMemo(() => subjectTree(subjects), [subjects]);
  const filterIds = filter ? scopeIds(subjects, filter) : null;
  const visible = filterIds ? cards.filter((c) => filterIds.includes(c.subject_id)) : cards;
  const selected = filter ? subjects.find((s) => s.id === filter) : undefined;
  const rootId = selected?.parent_id ?? selected?.id ?? null;
  const frentes = rootId ? (tree.find((t) => t.subject.id === rootId)?.children ?? []) : [];

  const due = visible.filter((c) => isDue(c)).length;
  const mastered = visible.filter((c) => c.box >= 5).length;
  const reviews = visible.reduce((acc, c) => acc + c.reviews, 0);
  const { buckets, max } = boxStats(visible);

  return (
    <>
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">Revisão</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Flashcards</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {cards.length} cartões no fichário · {tree.length} matérias
        </p>
      </header>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter(null)}
          className={
            filter === null
              ? "rounded-full bg-sun px-3 py-1.5 font-mono text-[11px] font-semibold text-primary-foreground"
              : "rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-ink-soft transition-colors hover:border-sun"
          }
        >
          todas
        </button>
        {tree.map(({ subject: s }) => {
          const ids = scopeIds(subjects, s.id);
          const count = cards.filter((c) => ids.includes(c.subject_id)).length;
          if (count === 0) return null;
          return (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className={
                rootId === s.id
                  ? "flex items-center gap-1.5 rounded-full bg-sun px-3 py-1.5 font-mono text-[11px] font-semibold text-primary-foreground"
                  : "flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-ink-soft transition-colors hover:border-sun"
              }
            >
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.name} · {count}
            </button>
          );
        })}
      </div>

      {frentes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 border-l-2 border-line pl-3">
          <button
            onClick={() => setFilter(rootId)}
            className={
              filter === rootId
                ? "rounded-full bg-sun/20 px-3 py-1 font-mono text-[10px] font-semibold text-sun-deep"
                : "rounded-full border border-line px-3 py-1 font-mono text-[10px] text-ink-soft transition-colors hover:border-sun"
            }
          >
            toda a matéria
          </button>
          {frentes.map((f) => {
            const count = cards.filter((c) => c.subject_id === f.id).length;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={
                  filter === f.id
                    ? "rounded-full bg-sun/20 px-3 py-1 font-mono text-[10px] font-semibold text-sun-deep"
                    : "rounded-full border border-line px-3 py-1 font-mono text-[10px] text-ink-soft transition-colors hover:border-sun"
                }
              >
                {f.name.replace(/^.*\(/, "").replace(/\)$/, "")} · {count}
              </button>
            );
          })}
        </div>
      )}


      <section className="mt-5 grid gap-4 sm:grid-cols-4">
        {[
          ["Para hoje", due],
          ["Dominados", mastered],
          ["No filtro", visible.length],
          ["Revisões feitas", reviews],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-line bg-card p-4">
            <p className="font-display text-2xl font-bold">{value as number}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              {label as string}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FlashcardReview cards={visible} subjectId={filter} subjectNames={subjectNames} />
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-card p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Domínio por caixa (Leitner)
            </p>
            <div className="mt-4 flex h-28 items-end gap-2">
              {buckets.map((b) => (
                <div key={b.box} className="flex flex-1 flex-col items-center gap-1">
                  <span className="font-mono text-[10px] text-ink-soft">{b.count}</span>
                  <div
                    className="w-full rounded-t bg-sun/70"
                    style={{ height: `${(b.count / max) * 76 + 4}px` }}
                  />
                  <span className="font-mono text-[9px] text-ink-soft">{b.box}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-card p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Por matéria
            </p>
            <ul className="mt-3 divide-y divide-line">
              {tree.map(({ subject: s, children }) => {
                const ids = scopeIds(subjects, s.id);
                const sc = cards.filter((c) => ids.includes(c.subject_id));
                if (sc.length === 0) return null;
                const sDue = sc.filter((c) => isDue(c)).length;
                return (
                  <li key={s.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: s.color }} />
                        {s.name}
                      </span>
                      <span className="font-mono text-[11px] text-ink-soft">
                        {sDue > 0 ? `${sDue} hoje · ` : ""}
                        {sc.length} cards
                      </span>
                    </div>
                    {children.map((f) => {
                      const fc = cards.filter((c) => c.subject_id === f.id);
                      if (fc.length === 0) return null;
                      const fDue = fc.filter((c) => isDue(c)).length;
                      return (
                        <div
                          key={f.id}
                          className="mt-1 flex items-center justify-between pl-4 text-[13px] text-ink-soft"
                        >
                          <span>{f.name.replace(/^.*\(/, "").replace(/\)$/, "")}</span>
                          <span className="font-mono text-[10px]">
                            {fDue > 0 ? `${fDue} hoje · ` : ""}
                            {fc.length}
                          </span>
                        </div>
                      );
                    })}
                  </li>
                );
              })}
            </ul>

          </div>
        </div>
      </section>
    </>
  );
}
