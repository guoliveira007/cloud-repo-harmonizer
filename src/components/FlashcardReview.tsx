import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  isDue,
  logSession,
  nextBox,
  nextReviewDate,
  scheduleLabel,
  type Flashcard,
  type Quality,
} from "@/lib/study";

type Props = {
  cards: Flashcard[];
  subjectId?: string | null;
  /** Rótulo por matéria, para mostrar de onde veio o cartão. */
  subjectNames?: Record<string, { name: string; color: string }>;
  compact?: boolean;
};

const BOX_LABEL = ["", "reaprendendo", "aquecendo", "firmando", "quase lá", "consolidado", "dominado", "dominado"];

/** Embaralha sem alterar o array original. */
function shuffle<T>(list: T[]) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function FlashcardReview({ cards, subjectId, subjectNames, compact }: Props) {
  const queryClient = useQueryClient();
  const [onlyDue, setOnlyDue] = useState(true);
  /** Fila da rodada: cada id aparece uma vez; difíceis são reinseridos. */
  const [queue, setQueue] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ dificil: 0, bom: 0, facil: 0 });
  const [busy, setBusy] = useState(false);
  /** Ids já concluídos (bom/fácil) nesta rodada — nunca voltam. */
  const [done, setDone] = useState<Record<string, true>>({});
  /** Ids em reaprendizagem (respondidos "difícil" e ainda não acertados). */
  const [relearning, setRelearning] = useState<Record<string, true>>({});
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);

  const cardsById = useMemo(() => {
    const map: Record<string, Flashcard> = {};
    for (const c of cards) map[c.id] = c;
    return map;
  }, [cards]);

  const dueCount = useMemo(() => cards.filter((c) => isDue(c)).length, [cards]);

  const sessionKey = `${subjectId ?? "all"}|${onlyDue}`;
  const startedKey = useRef<string | null>(null);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const doneRef = useRef(done);
  doneRef.current = done;

  const buildQueue = useCallback(
    (keepDone: boolean) => {
      const now = Date.now();
      const skip = keepDone ? doneRef.current : {};
      const pool = cardsRef.current.filter(
        (c) => !skip[c.id] && (onlyDue ? isDue(c, now) : true),
      );
      // vencidos há mais tempo e caixas baixas primeiro; embaralha dentro de cada grupo
      const groups = new Map<string, Flashcard[]>();
      for (const c of pool) {
        const overdueDays = Math.max(
          0,
          Math.floor((now - new Date(c.next_review).getTime()) / 86400000),
        );
        const key = `${overdueDays > 7 ? 0 : overdueDays > 0 ? 1 : 2}|${Math.min(c.box, 6)}`;
        const list = groups.get(key) ?? [];
        list.push(c);
        groups.set(key, list);
      }
      return [...groups.keys()]
        .sort()
        .flatMap((k) => shuffle(groups.get(k)!))
        .map((c) => c.id);
    },
    [onlyDue],
  );

  // (re)inicia a rodada só quando muda o filtro/modo — não em revalidações de dados
  useEffect(() => {
    if (startedKey.current === sessionKey) return;
    if (cards.length === 0 && startedKey.current !== null) return;
    const previous = startedKey.current;
    startedKey.current = sessionKey;
    // ao trocar de matéria mantemos o histórico da sessão para não repetir cartões
    setQueue(buildQueue(previous !== null));
    setPos(0);
    setRevealed(false);
    setRelearning({});
    setLastFeedback(null);
    if (previous === null) {
      setStats({ dificil: 0, bom: 0, facil: 0 });
      setDone({});
    }
  }, [sessionKey, buildQueue, cards.length]);

  // primeira carga: os cartões podem chegar depois da montagem
  useEffect(() => {
    if (queue.length === 0 && pos === 0 && cards.length > 0 && startedKey.current === sessionKey) {
      const q = buildQueue(true);
      if (q.length > 0) setQueue(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length]);

  const currentId = queue[pos];
  const card: Flashcard | undefined = currentId ? cardsById[currentId] : undefined;

  // pula ids que sumiram da lista (cartão apagado ou fora do filtro)
  useEffect(() => {
    if (currentId && !cardsById[currentId]) setPos((p) => p + 1);
  }, [currentId, cardsById]);

  const answer = useCallback(
    async (quality: Quality) => {
      if (!card || busy) return;
      setBusy(true);
      const box = nextBox(card.box, quality);
      const next = nextReviewDate(box, quality);
      const reviews = card.reviews + 1;
      try {
        const { error } = await supabase
          .from("flashcards")
          .update({ box, reviews, next_review: next })
          .eq("id", card.id);
        if (error) throw error;

        // atualiza o cache imediatamente: todas as listas (por matéria e geral)
        // passam a enxergar o novo agendamento, então o cartão não reaparece.
        queryClient.setQueriesData<Flashcard[]>({ queryKey: ["flashcards"] }, (old) =>
          Array.isArray(old)
            ? old.map((c) => (c.id === card.id ? { ...c, box, reviews, next_review: next } : c))
            : old,
        );

        await logSession({
          subject_id: subjectId ?? card.subject_id,
          cards_reviewed: 1,
          minutes: 1,
        });

        setStats((s) => ({ ...s, [quality]: s[quality] + 1 }));
        setLastFeedback(`${card.front.slice(0, 40)} — ${scheduleLabel(quality, box)}`);

        if (quality === "dificil") {
          setRelearning((r) => ({ ...r, [card.id]: true }));
          // volta a aparecer nesta rodada, algumas posições à frente
          setQueue((q) => {
            const rest = q.slice(pos + 1).filter((id) => id !== card.id);
            const at = Math.min(3, rest.length);
            return [...q.slice(0, pos + 1), ...rest.slice(0, at), card.id, ...rest.slice(at)];
          });
        } else {
          setDone((d) => ({ ...d, [card.id]: true }));
          setRelearning((r) => {
            if (!r[card.id]) return r;
            const copy = { ...r };
            delete copy[card.id];
            return copy;
          });
          // garante que não sobrou outra ocorrência do mesmo cartão na fila
          setQueue((q) => [
            ...q.slice(0, pos + 1),
            ...q.slice(pos + 1).filter((id) => id !== card.id),
          ]);
        }

        setRevealed(false);
        setPos((p) => p + 1);
        queryClient.invalidateQueries({ queryKey: ["sessions"] });
      } finally {
        setBusy(false);
      }
    },
    [card, busy, pos, subjectId, queryClient],
  );

  // atalhos de teclado: espaço revela, 1/2/3 respondem
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA"].includes(el.tagName)) return;
      if (!card) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        void answer(e.key === "1" ? "dificil" : e.key === "2" ? "bom" : "facil");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, answer]);

  function restart(fresh: boolean) {
    if (fresh) {
      setDone({});
      setStats({ dificil: 0, bom: 0, facil: 0 });
    }
    setRelearning({});
    setLastFeedback(null);
    setRevealed(false);
    setPos(0);
    setQueue(buildQueue(!fresh));
    queryClient.invalidateQueries({ queryKey: ["flashcards"] });
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        Revisão espaçada
      </p>
      <div className="flex items-center gap-1 rounded-full border border-line p-0.5 font-mono text-[10px]">
        <button
          onClick={() => setOnlyDue(true)}
          className={
            onlyDue
              ? "rounded-full bg-sun px-2.5 py-1 font-semibold text-primary-foreground"
              : "rounded-full px-2.5 py-1 text-ink-soft"
          }
        >
          do dia ({dueCount})
        </button>
        <button
          onClick={() => setOnlyDue(false)}
          className={
            !onlyDue
              ? "rounded-full bg-sun px-2.5 py-1 font-semibold text-primary-foreground"
              : "rounded-full px-2.5 py-1 text-ink-soft"
          }
        >
          todos ({cards.length})
        </button>
      </div>
    </div>
  );

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-card p-5">
        {header}
        <p className="mt-4 text-sm text-ink-soft">
          Nenhum cartão por aqui ainda. Crie o primeiro na página da matéria ou gere
          automaticamente a partir de um PDF.
        </p>
      </div>
    );
  }

  if (!card) {
    const total = stats.dificil + stats.bom + stats.facil;
    const doneCount = Object.keys(done).length;
    return (
      <div className="rounded-xl border border-line bg-card p-5">
        {header}
        <p className="mt-4 font-display text-lg font-bold">
          {total > 0 ? "Rodada concluída 🎉" : "Nada para revisar agora"}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {total > 0
            ? `${doneCount} cartão(ões) concluído(s) em ${total} resposta(s): ${stats.facil} fácil · ${stats.bom} bom · ${stats.dificil} difícil.`
            : "Você já revisou tudo que vencia agora. Use “todos” para treinar à frente."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => restart(false)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-sun"
          >
            <RotateCcw className="size-3.5" /> Buscar novos vencidos
          </button>
          <button
            onClick={() => restart(true)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-sun"
          >
            Treinar tudo de novo
          </button>
        </div>
      </div>
    );
  }

  const total = queue.length;
  const doneCount = Object.keys(done).length;
  const remaining = total - pos;
  const answered = stats.dificil + stats.bom + stats.facil;
  const progress = Math.round((pos / Math.max(1, total)) * 100);
  const subject = subjectNames?.[card.subject_id];

  return (
    <div className="rounded-xl border border-line bg-card p-5">
      {header}

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-sun transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="font-mono text-[11px] text-ink-soft">
          {doneCount} ok · {remaining} restantes
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {subject && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-soft">
            <span className="size-2 rounded-full" style={{ background: subject.color }} />
            {subject.name}
          </span>
        )}
        <span className="rounded-full bg-sun/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sun-deep">
          caixa {card.box} · {BOX_LABEL[Math.min(card.box, 7)]}
        </span>
        {relearning[card.id] && (
          <span className="rounded-full bg-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-soft">
            reforço
          </span>
        )}
        {card.reviews > 0 && (
          <span className="font-mono text-[10px] text-ink-soft">{card.reviews} revisões</span>
        )}
        {answered > 0 && <span className="font-mono text-[10px] text-ink-soft">{answered} respostas</span>}
      </div>

      <button
        key={card.id + String(revealed)}
        onClick={() => setRevealed(true)}
        className={`cardrise mt-3 grid w-full place-items-center rounded-lg border border-line bg-paper px-5 text-center ${
          compact ? "py-7" : "py-10"
        }`}
      >
        <p className="font-display text-sm font-medium leading-relaxed whitespace-pre-line">
          {revealed ? card.back : card.front}
        </p>
        {!revealed && (
          <span className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            toque ou espaço para revelar
          </span>
        )}
      </button>

      <div className="mt-3 flex gap-2">
        {revealed ? (
          <>
            <button
              onClick={() => answer("dificil")}
              disabled={busy}
              className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-sun disabled:opacity-50"
            >
              Difícil <span className="font-mono text-[10px]">1</span>
            </button>
            <button
              onClick={() => answer("bom")}
              disabled={busy}
              className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-sun disabled:opacity-50"
            >
              Bom <span className="font-mono text-[10px]">2</span>
            </button>
            <button
              onClick={() => answer("facil")}
              disabled={busy}
              className="flex-1 rounded-lg bg-sun px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-sun-deep disabled:opacity-50"
            >
              Fácil <span className="font-mono text-[10px]">3</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="flex-1 rounded-lg bg-sun px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-sun-deep"
          >
            Revelar resposta
          </button>
        )}
      </div>

      {lastFeedback && (
        <p className="mt-2 truncate font-mono text-[10px] text-ink-soft">último: {lastFeedback}</p>
      )}
    </div>
  );
}
