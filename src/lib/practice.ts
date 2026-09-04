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
