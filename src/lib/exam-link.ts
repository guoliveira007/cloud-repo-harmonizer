import { supabase } from "@/integrations/supabase/client";
import { childrenOf, nextReviewDate, type Subject } from "@/lib/study";

/** Texto sem acento, minúsculo — para comparar nomes de matéria. */
function norm(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Palavras que apontam para cada matéria do fichário. */
const SUBJECT_ALIASES: Array<{ subject: string; test: RegExp }> = [
  { subject: "Matemática", test: /matemat|algebr|geometr|trigonom|estatist|probabilid|funcao|logaritm/ },
  { subject: "Física", test: /fisic|cinemat|dinamic|eletrodinam|termolog|optic|ondulator/ },
  { subject: "Química", test: /quimic|estequiom|organic|inorganic|termoquim|eletroquim/ },
  { subject: "Biologia", test: /biolog|citolog|genetic|ecolog|botanic|zoolog|fisiolog|evolucao/ },
  { subject: "Geografia", test: /geograf|cartograf|geopolit|climatolog|atualidad/ },
  { subject: "História", test: /histor/ },
  { subject: "Filosofia e Sociologia", test: /filosof|sociolog/ },
  {
    subject: "Português",
    test: /portugu|linguagen|redacao|literat|gramatic|interpretacao|texto|sintax|morfolog/,
  },
];

/** Palavra-chave → nome da frente, por matéria. */
const FRENTE_HINTS: Record<string, Array<{ test: RegExp; frente: string }>> = {
  "Português": [
    { test: /redacao|dissertat|argumentat/, frente: "Redação" },
    { test: /literat|modernism|romantism|realism|barroc|trovador/, frente: "Literatura" },
    { test: /gramatic|sintax|morfolog|concordanc|regenc|crase|pontuacao|verb/, frente: "Gramática" },
    { test: /interpretacao|texto|leitura|semantic|coesao|coerenc/, frente: "Interpretação de Texto" },
  ],
  "Geografia": [{ test: /atualidad|geopolit|conflito|economia mundial/, frente: "Atualidades" }],
  "História": [
    { test: /brasil|brasileir/, frente: "HB" },
    { test: /geral|mundial|europ|antiguidad|idade media|guerra/, frente: "HG" },
  ],
  "Filosofia e Sociologia": [
    { test: /filosof/, frente: "Filosofia" },
    { test: /sociolog|socied|cultura|trabalho/, frente: "Sociologia" },
  ],
};

/**
 * Descobre a matéria (ou a frente) do fichário para uma questão de simulado.
 * Prefere sempre a frente mais específica quando dá para identificar.
 */
export function matchSubjectId(
  subjects: Subject[],
  subjectText: string | null | undefined,
  topicText?: string | null,
): string | null {
  const haystack = `${norm(subjectText)} ${norm(topicText)}`.trim();
  if (!haystack) return null;

  const alias = SUBJECT_ALIASES.find((a) => a.test.test(haystack));
  if (!alias) return null;

  const parent = subjects.find((s) => !s.parent_id && norm(s.name) === norm(alias.subject));
  if (!parent) return null;

  const frentes = childrenOf(subjects, parent.id);
  const hints = FRENTE_HINTS[alias.subject] ?? [];
  for (const hint of hints) {
    if (!hint.test.test(haystack)) continue;
    const match = frentes.find((f) => norm(f.name).includes(norm(hint.frente)));
    if (match) return match.id;
  }
  return parent.id;
}

/** Classifica em lote questões extraídas de uma prova. */
export function classifyQuestions<T extends { subject?: string | null; topic?: string | null }>(
  subjects: Subject[],
  rows: T[],
) {
  return rows.map((row) => ({
    ...row,
    subject_id: matchSubjectId(subjects, row.subject ?? null, row.topic ?? null),
  }));
}

/** Preenche a matéria das questões antigas que ainda não estão ligadas ao fichário. */
export async function backfillExamSubjects(subjects: Subject[]) {
  if (subjects.length === 0) return 0;
  const { data } = await supabase
    .from("exam_questions")
    .select("id, subject, topic")
    .is("subject_id", null)
    .limit(500);
  const rows = data ?? [];
  let linked = 0;
  for (const row of rows) {
    const subjectId = matchSubjectId(subjects, row.subject, row.topic);
    if (!subjectId) continue;
    const { error } = await supabase
      .from("exam_questions")
      .update({ subject_id: subjectId })
      .eq("id", row.id);
    if (!error) linked += 1;
  }
  return linked;
}

type ReviewLike = {
  concept: string | null;
  why_wrong: string | null;
  correct_reasoning: string | null;
};

type QuestionLike = {
  id: string;
  subject_id?: string | null;
  subject: string | null;
  topic: string | null;
  statement: string | null;
  correct_answer: string | null;
};

function trim(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Cria um flashcard na frente correspondente a partir de um erro analisado.
 * Não duplica: cada questão vira no máximo um cartão.
 */
export async function createFlashcardFromError(
  subjects: Subject[],
  question: QuestionLike,
  review: ReviewLike,
) {
  const subjectId =
    question.subject_id ?? matchSubjectId(subjects, question.subject, question.topic);
  if (!subjectId) return "sem-materia" as const;

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return "sem-sessao" as const;

  const existing = await supabase
    .from("flashcards")
    .select("id")
    .eq("source_question_id", question.id)
    .maybeSingle();
  if (existing.data) return "exists" as const;

  const front = trim(
    `${question.topic ?? question.subject ?? "Erro de simulado"} — ${
      question.statement ?? "Questão errada no simulado"
    }`,
    500,
  );
  const back = trim(
    [
      review.concept ? `Conceito: ${review.concept}` : null,
      question.correct_answer ? `Gabarito: ${question.correct_answer}` : null,
      review.correct_reasoning,
      review.why_wrong ? `Onde errei: ${review.why_wrong}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    2000,
  );

  const { error } = await supabase.from("flashcards").insert({
    user_id: uid,
    subject_id: subjectId,
    source_question_id: question.id,
    front,
    back: back || "Revise o gabarito desta questão.",
    box: 1,
    next_review: nextReviewDate(1, "bom"),
  });
  if (error) return "erro" as const;
  return "created" as const;
}
