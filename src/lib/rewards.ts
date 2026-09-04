/**
 * Sistema de recompensas: metas de estudo que desbloqueiam animações
 * motivacionais com o objetivo final — Medicina na FMUSP ou na EPM/Unifesp.
 */
import type { Flashcard, Material, QuizQuestion, StudySession } from "@/lib/study";
import { computeStreak } from "@/lib/study";

export type RewardId =
  | "primeiro-passo"
  | "chuva-de-aprovacao"
  | "jaleco-branco"
  | "arcadas-fmusp"
  | "estetoscopio-epm"
  | "lista-de-aprovados"
  | ExtraRewardId;

/** Metas adicionais para manter a motivação durante todo o percurso. */
export type ExtraRewardId = (typeof EXTRA_REWARDS)[number]["id"];

export type Reward = {
  id: RewardId;
  title: string;
  goal: string;
  reason: string;
  /** meta numérica */
  target: number;
  /** progresso atual */
  current: number;
};

export type Stats = {
  streak: number;
  reviews: number;
  learned: number;
  correct: number;
  materialsRead: number;
  points: number;
  hours: number;
};

export function computeStats(input: {
  cards: Flashcard[];
  materials: Material[];
  questions: QuizQuestion[];
  sessions: StudySession[];
}): Stats {
  const { cards, materials, sessions } = input;
  const reviews = sessions.reduce((a, s) => a + s.cards_reviewed, 0);
  const correct = sessions.reduce((a, s) => a + s.correct, 0);
  const minutes = sessions.reduce((a, s) => a + s.minutes, 0);
  return {
    streak: computeStreak(sessions),
    reviews,
    learned: cards.filter((c) => c.box >= 4).length,
    correct,
    materialsRead: materials.filter((m) => m.read).length,
    points: reviews * 5 + correct * 10,
    hours: Math.floor(minutes / 60),
  };
}

export function buildRewards(s: Stats): Reward[] {
  const list: Reward[] = [
    {
      id: "primeiro-passo",
      title: "Primeiro passo",
      goal: "Revise 25 flashcards",
      reason: "Toda aprovação começa com uma sessão de estudo terminada.",
      target: 25,
      current: s.reviews,
    },
    {
      id: "chuva-de-aprovacao",
      title: "Chuva de aprovação",
      goal: "Mantenha 7 dias de sequência",
      reason: "Constância é o que separa quem passa de quem quase passa.",
      target: 7,
      current: s.streak,
    },
    {
      id: "jaleco-branco",
      title: "Busto do Dr. Arnaldo — FMUSP",
      goal: "Domine 100 flashcards (caixa 4+)",
      reason: "O busto na Av. Dr. Arnaldo, 455 espera quem consolida conteúdo.",
      target: 100,
      current: s.learned,
    },
    {
      id: "estetoscopio-epm",
      title: "Busto do Dr. Octávio — EPM/Unifesp",
      goal: "Acerte 200 questões de quiz",
      reason: "A entrada da Escola Paulista de Medicina cobra raciocínio treinado.",
      target: 200,
      current: s.correct,
    },

    {
      id: "arcadas-fmusp",
      title: "Arcadas — FMUSP",
      goal: "Acumule 5.000 pontos de estudo",
      reason: "As Arcadas da Oswaldo Cruz, 51 esperando o seu nome.",
      target: 5000,
      current: s.points,
    },
    {
      id: "lista-de-aprovados",
      title: "Lista de aprovados",
      goal: "Estude 100 horas registradas",
      reason: "O grande final: seu nome na lista de Medicina.",
      target: 100,
      current: s.hours,
    },
    ...EXTRA_REWARDS.map((r) => ({
      id: r.id as RewardId,
      title: r.title,
      goal: r.goal,
      reason: r.reason,
      target: r.target,
      current: s[r.stat],
    })),
  ];
  return list.sort((a, b) => Number(b.current >= b.target) - Number(a.current >= a.target));
}

export const EXTRA_REWARDS = [
  { id: "aquecimento", title: "Aquecimento", goal: "Revise 100 flashcards", reason: "O ritmo começa a virar hábito.", target: 100, stat: "reviews" },
  { id: "maratona-500", title: "Maratona de revisão", goal: "Revise 500 flashcards", reason: "Repetição espaçada é o motor da aprovação.", target: 500, stat: "reviews" },
  { id: "mil-cartoes", title: "Mil cartões", goal: "Revise 1.000 flashcards", reason: "Volume que separa candidato de aprovado.", target: 1000, stat: "reviews" },
  { id: "revisor-2500", title: "Revisor incansável", goal: "Revise 2.500 flashcards", reason: "A FMUSP cobra conteúdo consolidado.", target: 2500, stat: "reviews" },
  { id: "revisor-5000", title: "Memória de ferro", goal: "Revise 5.000 flashcards", reason: "Você já não esquece o que estudou.", target: 5000, stat: "reviews" },
  { id: "chama-3", title: "Primeira chama", goal: "3 dias seguidos de estudo", reason: "Três dias já mudam a rotina.", target: 3, stat: "streak" },
  { id: "chama-14", title: "Duas semanas firmes", goal: "14 dias de sequência", reason: "Metade de um mês sem falhar.", target: 14, stat: "streak" },
  { id: "chama-30", title: "Um mês inteiro", goal: "30 dias de sequência", reason: "Disciplina de quem passa em Medicina.", target: 30, stat: "streak" },
  { id: "chama-60", title: "Dois meses de fogo", goal: "60 dias de sequência", reason: "A vaga se constrói dia após dia.", target: 60, stat: "streak" },
  { id: "chama-100", title: "Cem dias", goal: "100 dias de sequência", reason: "Poucos chegam aqui. Você chegou.", target: 100, stat: "streak" },
  { id: "dominio-25", title: "Domínio inicial", goal: "Domine 25 flashcards (caixa 4+)", reason: "O conteúdo começa a ficar seu.", target: 25, stat: "learned" },
  { id: "dominio-250", title: "Base sólida", goal: "Domine 250 flashcards", reason: "Base sólida para as provas de Medicina.", target: 250, stat: "learned" },
  { id: "dominio-500", title: "Repertório amplo", goal: "Domine 500 flashcards", reason: "Repertório de quem encara a segunda fase.", target: 500, stat: "learned" },
  { id: "dominio-1000", title: "Mil dominados", goal: "Domine 1.000 flashcards", reason: "Conteúdo na ponta da língua.", target: 1000, stat: "learned" },
  { id: "quiz-25", title: "Primeiros acertos", goal: "Acerte 25 questões", reason: "Todo treino começa pequeno.", target: 25, stat: "correct" },
  { id: "quiz-100", title: "Cem acertos", goal: "Acerte 100 questões", reason: "Raciocínio treinado vale pontos.", target: 100, stat: "correct" },
  { id: "quiz-500", title: "Simulado vivo", goal: "Acerte 500 questões", reason: "Você já pensa como o vestibular pensa.", target: 500, stat: "correct" },
  { id: "quiz-1000", title: "Mil acertos", goal: "Acerte 1.000 questões", reason: "Nível de quem disputa as primeiras chamadas.", target: 1000, stat: "correct" },
  { id: "leitura-5", title: "Leitor atento", goal: "Leia 5 materiais", reason: "Teoria antes da prática.", target: 5, stat: "materialsRead" },
  { id: "leitura-25", title: "Biblioteca pessoal", goal: "Leia 25 materiais", reason: "Sua biblioteca virou rotina.", target: 25, stat: "materialsRead" },
  { id: "leitura-60", title: "Acervo dominado", goal: "Leia 60 materiais", reason: "Conteúdo completo, sem atalhos.", target: 60, stat: "materialsRead" },
  { id: "pontos-1000", title: "Mil pontos", goal: "Acumule 1.000 pontos", reason: "O placar começa a subir.", target: 1000, stat: "points" },
  { id: "pontos-15000", title: "Quinze mil pontos", goal: "Acumule 15.000 pontos", reason: "Consistência acumulada vira aprovação.", target: 15000, stat: "points" },
  { id: "horas-25", title: "25 horas", goal: "Estude 25 horas registradas", reason: "O relógio trabalha a seu favor.", target: 25, stat: "hours" },
  { id: "horas-300", title: "300 horas", goal: "Estude 300 horas registradas", reason: "Horas de jaleco antes do jaleco.", target: 300, stat: "hours" },
  { id: "revisor-50", title: "Primeiro bloco", goal: "Revise 50 flashcards", reason: "Metade do caminho do primeiro hábito.", target: 50, stat: "reviews" },
  { id: "revisor-250", title: "Ritmo de cursinho", goal: "Revise 250 flashcards", reason: "Ritmo semanal de quem leva a sério.", target: 250, stat: "reviews" },
  { id: "revisor-750", title: "Setecentos e cinquenta", goal: "Revise 750 flashcards", reason: "Você já revisou mais que a maioria.", target: 750, stat: "reviews" },
  { id: "revisor-1500", title: "Mil e quinhentas", goal: "Revise 1.500 flashcards", reason: "Cada revisão é um ponto na prova.", target: 1500, stat: "reviews" },
  { id: "revisor-3500", title: "Três mil e quinhentas", goal: "Revise 3.500 flashcards", reason: "Repetição espaçada trabalhando por você.", target: 3500, stat: "reviews" },
  { id: "revisor-7500", title: "Sete mil e quinhentas", goal: "Revise 7.500 flashcards", reason: "Volume de aprovação em primeira chamada.", target: 7500, stat: "reviews" },
  { id: "revisor-10000", title: "Dez mil revisões", goal: "Revise 10.000 flashcards", reason: "O número de quem entra na FMUSP.", target: 10000, stat: "reviews" },
  { id: "chama-7", title: "Uma semana", goal: "7 dias de sequência", reason: "Sete dias: o hábito nasceu.", target: 7, stat: "streak" },
  { id: "chama-21", title: "Vinte e um dias", goal: "21 dias de sequência", reason: "O tempo clássico de formar um hábito.", target: 21, stat: "streak" },
  { id: "chama-45", title: "Quarenta e cinco dias", goal: "45 dias de sequência", reason: "Um bimestre sem falhar.", target: 45, stat: "streak" },
  { id: "chama-90", title: "Um trimestre", goal: "90 dias de sequência", reason: "Três meses de disciplina real.", target: 90, stat: "streak" },
  { id: "chama-180", title: "Meio ano", goal: "180 dias de sequência", reason: "Meio ano de constância imbatível.", target: 180, stat: "streak" },
  { id: "chama-365", title: "Um ano inteiro", goal: "365 dias de sequência", reason: "Um ano. Agora é só esperar a lista.", target: 365, stat: "streak" },
  { id: "dominio-50", title: "Cinquenta dominados", goal: "Domine 50 flashcards", reason: "O conteúdo já responde sozinho.", target: 50, stat: "learned" },
  { id: "dominio-150", title: "Cento e cinquenta", goal: "Domine 150 flashcards", reason: "Memória de longo prazo ativada.", target: 150, stat: "learned" },
  { id: "dominio-750", title: "Setecentos e cinquenta", goal: "Domine 750 flashcards", reason: "Repertório de segunda fase.", target: 750, stat: "learned" },
  { id: "dominio-1500", title: "Mil e quinhentos dominados", goal: "Domine 1.500 flashcards", reason: "Conteúdo de vestibular na palma da mão.", target: 1500, stat: "learned" },
  { id: "dominio-2500", title: "Enciclopédia viva", goal: "Domine 2.500 flashcards", reason: "Você virou referência do próprio estudo.", target: 2500, stat: "learned" },
  { id: "quiz-50", title: "Cinquenta acertos", goal: "Acerte 50 questões", reason: "O raciocínio começa a ficar afiado.", target: 50, stat: "correct" },
  { id: "quiz-250", title: "Duzentos e cinquenta", goal: "Acerte 250 questões", reason: "Consistência em prova.", target: 250, stat: "correct" },
  { id: "quiz-750", title: "Setecentos e cinquenta", goal: "Acerte 750 questões", reason: "Você já sente a pegada das bancas.", target: 750, stat: "correct" },
  { id: "quiz-2000", title: "Dois mil acertos", goal: "Acerte 2.000 questões", reason: "Nível de treino de aprovado.", target: 2000, stat: "correct" },
  { id: "quiz-5000", title: "Cinco mil acertos", goal: "Acerte 5.000 questões", reason: "Nenhuma prova te pega de surpresa.", target: 5000, stat: "correct" },
  { id: "leitura-10", title: "Dez materiais", goal: "Leia 10 materiais", reason: "Teoria em dia.", target: 10, stat: "materialsRead" },
  { id: "leitura-100", title: "Cem materiais", goal: "Leia 100 materiais", reason: "Acervo inteiro estudado.", target: 100, stat: "materialsRead" },
  { id: "pontos-5000", title: "Cinco mil pontos", goal: "Acumule 5.000 pontos", reason: "O placar ganhou corpo.", target: 5000, stat: "points" },
  { id: "pontos-50000", title: "Cinquenta mil pontos", goal: "Acumule 50.000 pontos", reason: "Placar de quem não para.", target: 50000, stat: "points" },
  { id: "horas-100", title: "100 horas", goal: "Estude 100 horas registradas", reason: "Cem horas depositadas na sua vaga.", target: 100, stat: "hours" },
  { id: "horas-1000", title: "Mil horas", goal: "Estude 1.000 horas registradas", reason: "Mil horas: o jaleco é questão de tempo.", target: 1000, stat: "hours" },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  goal: string;
  reason: string;
  target: number;
  stat: keyof Stats;
}>;

export const isUnlocked = (r: Reward) => r.current >= r.target;
export const pct = (r: Reward) => Math.min(100, Math.round((r.current / r.target) * 100));
