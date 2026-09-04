import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Target } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { FlashcardReview } from "@/components/FlashcardReview";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { errorKindLabel } from "@/lib/practice";
import {
  computeStreak,
  fetchFlashcards,
  fetchMaterials,
  fetchQuestions,
  fetchSessions,
  fetchSubjects,
  isDue,
  scopeIds,
  subjectTree,
} from "@/lib/study";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel de estudos — Fichário" },
      {
        name: "description",
        content:
          "Veja o que estudar hoje, o progresso por área e revise flashcards de todas as suas matérias.",
      },
      { property: "og:title", content: "Painel de estudos — Fichário" },
      {
        property: "og:description",
        content: "Seu plano de estudos do dia, progresso por área e revisão de flashcards.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <Painel />
    </AppShell>
  ),
});

const AREAS = ["Matemática", "Naturezas", "Humanas", "Linguagens"] as const;
const AREA_COLOR: Record<string, string> = {
  Matemática: "#e08a3c",
  Naturezas: "#6f8f4b",
  Humanas: "#c9503f",
  Linguagens: "#4d7a5c",
};


function Painel() {
  const { user } = useAuth();
  const { data: subjects = [] } = useQuery({ queryKey: ["subjects"], queryFn: fetchSubjects });
  const { data: materials = [] } = useQuery({
    queryKey: ["materials", "all"],
    queryFn: () => fetchMaterials(),
  });
  const { data: cards = [] } = useQuery({
    queryKey: ["flashcards", "all"],
    queryFn: () => fetchFlashcards(),
  });
  const { data: questions = [] } = useQuery({
    queryKey: ["questions", "all"],
    queryFn: () => fetchQuestions(),
  });
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions"], queryFn: fetchSessions });

  const pendingReviews = useQuery({
    queryKey: ["subject-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("error_reviews")
        .select("id, error_type, created_at, question:exam_questions(subject_id, topic)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const pendingSubjects = useMemo(() => {
    const bySubject = new Map<
      string | null,
      { count: number; last: string; kinds: Map<string, number>; topics: Set<string> }
    >();
    for (const row of pendingReviews.data ?? []) {
      const q = Array.isArray(row.question) ? row.question[0] : row.question;
      const key = q?.subject_id ?? null;
      const entry =
        bySubject.get(key) ?? {
          count: 0,
          last: row.created_at,
          kinds: new Map<string, number>(),
          topics: new Set<string>(),
        };
      entry.count += 1;
      if (row.created_at > entry.last) entry.last = row.created_at;
      if (row.error_type)
        entry.kinds.set(row.error_type, (entry.kinds.get(row.error_type) ?? 0) + 1);
      if (q?.topic) entry.topics.add(q.topic);
      bySubject.set(key, entry);
    }
    return [...bySubject.entries()]
      .map(([subjectId, v]) => ({
        subjectId,
        name:
          (subjectId ? subjects.find((s) => s.id === subjectId)?.name : null) ?? "Sem matéria",
        count: v.count,
        last: v.last,
        topKind: [...v.kinds.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        topics: [...v.topics].slice(0, 4),
      }))
      .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
  }, [pendingReviews.data, subjects]);

  const streak = computeStreak(sessions);
  const points = sessions.reduce((acc, s) => acc + s.cards_reviewed * 5 + s.correct * 10, 0);
  const dueCards = cards.filter((c) => isDue(c));

  const tree = subjectTree(subjects);

  const tasks = tree
    .map(({ subject: s }) => {
      const ids = scopeIds(subjects, s.id);
      const due = dueCards.filter((c) => ids.includes(c.subject_id)).length;
      const quiz = questions.filter((q) => ids.includes(q.subject_id)).length;
      const unread = materials.filter((m) => ids.includes(m.subject_id) && !m.read).length;
      if (due > 0)
        return { subject: s, label: `${due} cartões para revisar`, minutes: due * 2 || 5 };
      if (quiz > 0) return { subject: s, label: `Quiz com ${quiz} questões`, minutes: quiz * 2 };
      if (unread > 0) return { subject: s, label: `${unread} material(is) por ler`, minutes: 20 };
      return null;
    })
    .filter(Boolean)
    .slice(0, 3) as { subject: (typeof subjects)[number]; label: string; minutes: number }[];


  const areaProgress = AREAS.map((area) => {
    const ids = subjects.filter((s) => s.area === area).map((s) => s.id);
    const areaCards = cards.filter((c) => ids.includes(c.subject_id));
    const learned = areaCards.filter((c) => c.box >= 4).length;
    const areaMaterials = materials.filter((m) => ids.includes(m.subject_id));
    const readMaterials = areaMaterials.filter((m) => m.read).length;
    const total = areaCards.length + areaMaterials.length;
    const pct = total === 0 ? 0 : Math.round(((learned + readMaterials) / total) * 100);
    return { area, pct };
  });

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  })();

  const firstName = (user?.user_metadata?.["display_name"] as string | undefined)?.split(" ")[0];

  const subjectNames = Object.fromEntries(
    subjects.map((s) => [s.id, { name: s.name, color: s.color }]),
  ) as Record<string, { name: string; color: string }>;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="cardin">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-balance">
            Hora de virar a página.
          </h1>
        </div>
        <div className="cardin flex items-center gap-3 [animation-delay:90ms]">
          <div className="flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2">
            <span className="text-lg">🔥</span>
            <span className="font-display text-lg font-bold text-streak">{streak}</span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
              dias de sequência
            </span>
          </div>
          <div className="hidden rounded-lg border border-line bg-card px-4 py-2 text-right sm:block">
            <p className="font-display text-lg font-bold leading-none">
              {points.toLocaleString("pt-BR")}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">pontos</p>
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-4 lg:grid-cols-5">
        <div className="cardin lg:col-span-2 [animation-delay:120ms]">
          <FlashcardReview cards={cards} subjectNames={subjectNames} compact />
        </div>

        <div className="cardin rounded-xl border border-line bg-card p-5 lg:col-span-2 [animation-delay:150ms]">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Estudar hoje
            </p>
            <span className="rounded-full bg-sun/15 px-2.5 py-0.5 font-mono text-[10px] font-medium text-sun-deep">
              {tasks.length} tarefa{tasks.length === 1 ? "" : "s"}
            </span>
          </div>
          {tasks.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              Tudo em dia. Adicione materiais ou cartões em uma matéria para montar o plano de hoje.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {tasks.map((t) => (
                <li key={t.subject.id}>
                  <Link
                    to="/materia/$id"
                    params={{ id: t.subject.id }}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <span className="grid size-4 shrink-0 place-items-center rounded border border-sun" />
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: t.subject.color }}
                    />
                    <span className="text-sm font-medium">{t.subject.name}</span>
                    <span className="text-sm text-ink-soft">{t.label}</span>
                    <span className="ml-auto font-mono text-[10px] text-ink-soft">
                      {t.minutes} min
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cardin rounded-xl border border-line bg-card p-5 [animation-delay:210ms]">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            Progresso por área
          </p>
          <div className="mt-4 space-y-3">
            {areaProgress.map((a, i) => (
              <div key={a.area}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{a.area}</span>
                  <span className="font-mono text-[11px] text-ink-soft">{a.pct}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
                  <div
                    className="fillbar h-full rounded-full"
                    style={{
                      width: `${a.pct}%`,
                      background: AREA_COLOR[a.area],
                      animationDelay: `${220 + i * 100}ms`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 border-t border-line pt-4 font-mono text-[11px] text-ink-soft">
            {cards.length} cartões · {materials.length} materiais
          </p>
        </div>
      </section>


      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold tracking-tight">Minhas matérias</h2>
          <span className="font-mono text-[11px] text-ink-soft">{tree.length} fichas</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {tree.map(({ subject: s, children }, i) => {
            const ids = scopeIds(subjects, s.id);
            const sCards = cards.filter((c) => ids.includes(c.subject_id));
            const sMaterials = materials.filter((m) => ids.includes(m.subject_id));
            const sQuestions = questions.filter((q) => ids.includes(q.subject_id));
            const learned = sCards.filter((c) => c.box >= 4).length;
            const pct = sCards.length === 0 ? 0 : Math.round((learned / sCards.length) * 100);
            return (
              <Link
                key={s.id}
                to="/materia/$id"
                params={{ id: s.id }}
                className="cardin group relative rounded-xl border border-line bg-card p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_-18px_var(--sun-deep)]"
                style={{ animationDelay: `${120 + i * 40}ms` }}
              >
                <span
                  className="absolute -top-0.5 left-5 h-1.5 w-10 rounded-b-md"
                  style={{ background: s.color }}
                />
                <p className="font-display text-base font-semibold">{s.name}</p>
                <p className="mt-1 font-mono text-[11px] text-ink-soft">
                  {sMaterials.length} PDFs · {sCards.length} cards · {sQuestions.length} questões
                </p>
                {children.length > 0 && (
                  <p className="mt-0.5 font-mono text-[10px] text-ink-soft">
                    {children.length} frentes
                  </p>
                )}
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="fillbar h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: s.color,
                      animationDelay: `${340 + i * 40}ms`,
                    }}
                  />
                </div>
              </Link>
            );
          })}

        </div>
      </section>

      {pendingSubjects.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-sun-deep" />
            <h2 className="font-display text-xl font-bold tracking-tight">Assuntos pendentes</h2>
            <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 font-mono text-[10px] font-medium text-destructive">
              {pendingSubjects.reduce((acc, s) => acc + s.count, 0)} erros para revisar
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pendingSubjects.slice(0, 6).map((p) => (
              <div key={p.subjectId ?? "sem"} className="rounded-xl border border-line bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-display text-base font-semibold">{p.name}</p>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {p.count} erro{p.count === 1 ? "" : "s"}
                  </span>
                </div>
                {p.topKind && (
                  <p className="mt-1 text-xs text-ink-soft">
                    Causa mais comum: {errorKindLabel(p.topKind)}
                  </p>
                )}
                {p.topics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.topics.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-soft"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex gap-3">
                  <Link
                    to="/revisoes"
                    className="font-mono text-[10px] uppercase tracking-[0.15em] text-sun-deep hover:underline"
                  >
                    Revisar erros
                  </Link>
                  <Link
                    to="/praticar"
                    className="font-mono text-[10px] uppercase tracking-[0.15em] text-sun-deep hover:underline"
                  >
                    Praticar
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <div>
          <h2 className="mb-4 font-display text-xl font-bold tracking-tight">
            Materiais recentes
          </h2>
          <div className="rounded-xl border border-line bg-card p-5">
            {materials.length === 0 ? (
              <p className="text-sm text-ink-soft">
                Nenhum arquivo ainda. Envie PDFs pela página de uma matéria ou pela Biblioteca.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {materials.slice(0, 4).map((m) => {
                  const subject = subjects.find((s) => s.id === m.subject_id);
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-sun/15 font-mono text-[10px] font-medium text-sun-deep">
                        {m.kind}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.title}</p>
                        <p className="font-mono text-[10px] text-ink-soft">{subject?.name}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
