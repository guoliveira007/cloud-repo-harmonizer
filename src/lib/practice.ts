/** Os três tipos de erro confirmados pelo aluno (valor gravado em error_reviews.error_type). */
export const ERROR_KINDS = [
  {
    id: "nao_sabia_conceito",
    label: "não sabia o conceito",
    hint: "mais questões do mesmo assunto",
  },
  {
    id: "confundiu_assunto",
    label: "confundi com outro assunto",
    hint: "intercala os dois assuntos",
  },
  {
    id: "desatencao_conta",
    label: "desatenção / conta",
    hint: "repete o mesmo tipo de questão",
  },
] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number]["id"];

export const ERROR_KIND_IDS = ERROR_KINDS.map((k) => k.id) as ErrorKind[];

export function errorKindLabel(value: string | null | undefined): string {
  return ERROR_KINDS.find((k) => k.id === value)?.label ?? value ?? "—";
}

/** Converte o texto livre que a IA devolve em um dos três tipos fixos. */
export function toErrorKind(raw: string | null | undefined): ErrorKind {
  const v = (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (ERROR_KIND_IDS.includes(v as ErrorKind)) return v as ErrorKind;
  if (/conteudo|chute|nao sabia|desconhec/.test(v)) return "nao_sabia_conceito";
  if (/interpret|confund|troca/.test(v)) return "confundiu_assunto";
  if (/desaten|conta|calculo|tempo|distra/.test(v)) return "desatencao_conta";
  return "nao_sabia_conceito";
}

export const PRACTICE_STATUS = "pratica";
export const BANK_STATUS = "banco";
/** Exames que não contam como "prova que eu fiz". */
export const HIDDEN_EXAM_STATUS = [PRACTICE_STATUS, BANK_STATUS];

/** Questão disponível para uma sessão de prática. */
export type PracticePoolQuestion = {
  id: string;
  subject_id: string | null;
  subject: string | null;
  topic: string | null;
  statement: string;
  options: Record<string, string>;
  correct_answer: string;
};

/**
 * Escolhe a próxima questão da sessão com base no tipo de erro anterior:
 * - nao_sabia_conceito → mais questões do mesmo assunto;
 * - confundiu_assunto → intercala com outra matéria;
 * - desatencao_conta → repete o mesmo tipo de questão (mesmo tópico);
 * - sem contexto → a primeira disponível (pool já vem embaralhado).
 */
export function pickNextPractice(
  pool: PracticePoolQuestion[],
  used: Set<string>,
  last: { kind: ErrorKind | null; subjectId: string | null; topic: string | null },
): PracticePoolQuestion | null {
  const remaining = pool.filter((q) => !used.has(q.id));
  if (remaining.length === 0) return null;
  if (!last.kind) return remaining[0]!;

  if (last.kind === "nao_sabia_conceito" && last.subjectId) {
    const same = remaining.find((q) => q.subject_id === last.subjectId);
    if (same) return same;
  }
  if (last.kind === "desatencao_conta" && last.topic) {
    const sameTopic = remaining.find((q) => q.topic && q.topic === last.topic);
    if (sameTopic) return sameTopic;
    const sameSubject = remaining.find((q) => q.subject_id === last.subjectId);
    if (sameSubject) return sameSubject;
  }
  if (last.kind === "confundiu_assunto" && last.subjectId) {
    const other = remaining.find((q) => q.subject_id && q.subject_id !== last.subjectId);
    if (other) return other;
  }
  return remaining[0]!;
}
