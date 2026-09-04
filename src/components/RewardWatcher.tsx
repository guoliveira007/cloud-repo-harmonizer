import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { RewardAnimation } from "@/components/RewardAnimation";
import { buildRewards, computeStats, isUnlocked, type RewardId } from "@/lib/rewards";
import {
  fetchFlashcards,
  fetchMaterials,
  fetchQuestions,
  fetchSessions,
} from "@/lib/study";

const KEY = (uid: string) => `rewards:seen:${uid}`;

function readSeen(uid: string): RewardId[] {
  try {
    const raw = localStorage.getItem(KEY(uid));
    return raw ? (JSON.parse(raw) as RewardId[]) : [];
  } catch {
    return [];
  }
}

/**
 * Observa o progresso e dispara automaticamente a animação assim que uma
 * recompensa é conquistada. Depois disso ela fica disponível no diálogo.
 */
export function RewardWatcher({ userId }: { userId: string }) {
  const [queue, setQueue] = useState<RewardId[]>([]);

  const { data: cards = [] } = useQuery({ queryKey: ["flashcards", "all"], queryFn: () => fetchFlashcards() });
  const { data: materials = [] } = useQuery({ queryKey: ["materials", "all"], queryFn: () => fetchMaterials() });
  const { data: questions = [] } = useQuery({ queryKey: ["questions", "all"], queryFn: () => fetchQuestions() });
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions"], queryFn: fetchSessions });

  const unlockedIds = buildRewards(
    computeStats({ cards, materials, questions, sessions }),
  )
    .filter(isUnlocked)
    .map((r) => r.id);
  const signature = unlockedIds.join(",");

  useEffect(() => {
    if (!userId) return;
    const ids = signature ? (signature.split(",") as RewardId[]) : [];
    const seen = readSeen(userId);
    const fresh = ids.filter((id) => !seen.includes(id));
    // primeira carga sem histórico: apenas registra, não dispara retroativo
    if (!localStorage.getItem(KEY(userId))) {
      localStorage.setItem(KEY(userId), JSON.stringify(ids));
      return;
    }
    if (fresh.length) {
      localStorage.setItem(KEY(userId), JSON.stringify([...seen, ...fresh]));
      setQueue((q) => [...q, ...fresh.filter((id) => !q.includes(id))]);
    }
  }, [signature, userId]);

  const current = queue[0];
  if (!current) return null;
  return (
    <RewardAnimation
      key={current}
      id={current}
      celebrate
      autoCloseMs={10000}
      onClose={() => setQueue((q) => q.slice(1))}
    />
  );
}
