import { supabase } from "@/integrations/supabase/client";

export type ReviewSummary = {
  id: string;
  lesson_id: string | null;
  lesson_title: string | null;
  summary: string;
  created_at: string;
  lesson_url: string | null;
};

export type ReviewMaterial = {
  id: string;
  title: string;
  kind: string;
  link_url: string | null;
  file_path: string | null;
};

export type ReviewSources = {
  subjectId: string | null;
  summaries: ReviewSummary[];
  materials: ReviewMaterial[];
  /** Últimas tentativas do mesmo assunto indicam falta de base conceitual. */
  conceptGap: boolean;
};

const EMPTY: ReviewSources = {
  subjectId: null,
  summaries: [],
  materials: [],
  conceptGap: false,
};

/**
 * A partir da questão errada, encontra onde revisar: resumos de aula e
 * materiais de conteúdo do mesmo subject_id, mais o link direto da aula.
 */
export async function fetchReviewSources(questionId: string): Promise<ReviewSources> {
  const { data: question } = await supabase
    .from("exam_questions")
    .select("subject_id")
    .eq("id", questionId)
    .maybeSingle();

  const subjectId = question?.subject_id ?? null;
  if (!subjectId) return EMPTY;

  const [{ data: summaryRows }, { data: materialRows }, { data: recentQuestions }] =
    await Promise.all([
      supabase
        .from("lesson_summaries")
        .select("id, lesson_id, lesson_title, summary, created_at")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("materials")
        .select("id, title, kind, link_url, file_path")
        .eq("subject_id", subjectId)
        .neq("kind", "edital")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("exam_questions")
        .select("id")
        .eq("subject_id", subjectId)
        .eq("is_correct", false)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

  // Link direto da aula (custom_lessons.url) via lesson_summaries.lesson_id
  const lessonIds = (summaryRows ?? [])
    .map((s) => s.lesson_id)
    .filter((id): id is string => Boolean(id) && /^[0-9a-f-]{36}$/i.test(id ?? ""));
  const urlById = new Map<string, string>();
  if (lessonIds.length > 0) {
    const { data: lessons } = await supabase
      .from("custom_lessons")
      .select("id, url")
      .in("id", lessonIds);
    for (const l of lessons ?? []) if (l.url) urlById.set(l.id, l.url);
  }

  let conceptGap = false;
  const attemptIds = (recentQuestions ?? []).map((q) => q.id);
  if (attemptIds.length >= 2) {
    const { data: reviews } = await supabase
      .from("error_reviews")
      .select("error_type")
      .in("question_id", attemptIds);
    const kinds = (reviews ?? []).map((r) => r.error_type);
    conceptGap =
      kinds.length >= 2 && kinds.every((k) => k === "nao_sabia_conceito");
  }

  return {
    subjectId,
    summaries: (summaryRows ?? []).map((s) => ({
      id: s.id,
      lesson_id: s.lesson_id,
      lesson_title: s.lesson_title,
      summary: s.summary ?? "",
      created_at: s.created_at,
      lesson_url: s.lesson_id ? (urlById.get(s.lesson_id) ?? null) : null,
    })),
    materials: materialRows ?? [],
    conceptGap,
  };
}
