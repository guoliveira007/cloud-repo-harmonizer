import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Play, Trophy } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RewardAnimation } from "@/components/RewardAnimation";
import {
  buildRewards,
  computeStats,
  isUnlocked,
  pct,
  type RewardId,
} from "@/lib/rewards";
import {
  fetchFlashcards,
  fetchMaterials,
  fetchQuestions,
  fetchSessions,
} from "@/lib/study";

export function RewardsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [playing, setPlaying] = useState<RewardId | null>(null);

  const { data: cards = [] } = useQuery({
    queryKey: ["flashcards", "all"],
    queryFn: () => fetchFlashcards(),
    enabled: open,
  });
  const { data: materials = [] } = useQuery({
    queryKey: ["materials", "all"],
    queryFn: () => fetchMaterials(),
    enabled: open,
  });
  const { data: questions = [] } = useQuery({
    queryKey: ["questions", "all"],
    queryFn: () => fetchQuestions(),
    enabled: open,
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: fetchSessions,
    enabled: open,
  });

  const stats = computeStats({ cards, materials, questions, sessions });
  const rewards = buildRewards(stats);
  const unlocked = rewards.filter(isUnlocked).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Trophy className="size-4 text-sun-deep" />
              Recompensas
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-ink-soft">
            Metas rumo a Medicina na <strong>FMUSP</strong> ou na{" "}
            <strong>EPM/Unifesp</strong>. Cada meta atingida libera uma animação de comemoração.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-sun-deep">
            {unlocked} de {rewards.length} desbloqueadas
          </p>

          <ul className="mt-1 space-y-3">
            {rewards.map((r) => {
              const done = isUnlocked(r);
              const p = pct(r);
              return (
                <li
                  key={r.id}
                  className={
                    done
                      ? "rounded-xl border border-sun/50 bg-sun/10 p-4"
                      : "rounded-xl border border-line bg-card p-4"
                  }
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-semibold">{r.title}</p>
                      <p className="text-[13px] text-ink-soft">{r.goal}</p>
                      <p className="mt-1 font-mono text-[10px] text-ink-soft">{r.reason}</p>
                    </div>
                    <button
                      onClick={() => done && setPlaying(r.id)}
                      disabled={!done}
                      aria-label={done ? `Ver animação: ${r.title}` : "Meta bloqueada"}
                      className={
                        done
                          ? "grid size-9 shrink-0 place-items-center rounded-full bg-sun text-primary-foreground transition-transform hover:scale-105"
                          : "grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft"
                      }
                    >
                      {done ? <Play className="size-4" /> : <Lock className="size-3.5" />}
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <div
                        className="fillbar h-full rounded-full bg-sun"
                        style={{ width: `${p}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-ink-soft">
                      {Math.min(r.current, r.target).toLocaleString("pt-BR")}/
                      {r.target.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>

      {playing && <RewardAnimation id={playing} onClose={() => setPlaying(null)} />}
    </>
  );
}
