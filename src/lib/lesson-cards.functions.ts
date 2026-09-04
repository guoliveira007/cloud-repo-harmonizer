import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiJson } from "./exam-ai.server";

const MAX_TRANSCRIPT = 90_000;

/** Normaliza texto para comparar itens já existentes (ignora acento/pontuação). */
function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function avoidBlock(texts: string[]) {
  if (texts.length === 0) return "";
  const list = texts
    .slice(-120)
    .map((t) => `- ${t.slice(0, 160)}`)
    .join("\n");
  return `\n\nEstes itens JÁ existem e NÃO podem ser repetidos (nem reformulados com as mesmas palavras). Crie conteúdo sobre outros pontos da aula:\n${list}`;
}

async function loadExisting(
  supabase: any,
  table: "quiz_questions" | "flashcards",
  column: "question" | "front",
  subjectId: string,
  lessonId: string,
) {
  const { data } = await supabase
    .from(table)
    .select(column)
    .eq("subject_id", subjectId)
    .eq("lesson_id", lessonId)
    .limit(400);
  const texts: string[] = (data ?? [])
    .map((row: any) => String(row?.[column] ?? "").trim())
    .filter(Boolean);
  return { texts, keys: new Set(texts.map(normalizeText)) };
}

const input = z.object({
  lessonId: z.string().min(1),
  subjectId: z.string().uuid(),
  kind: z.enum(["flashcards", "quiz"]),
  count: z.number().int().min(3).max(25).optional(),
});

async function loadSummary(supabase: any, lessonId: string) {
  const { data, error } = await supabase
    .from("lesson_summaries")
    .select("lesson_title,subject,summary,transcript")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (error || !data?.summary)
    throw new Error("Esta aula ainda não tem resumo. Gere o resumo antes.");
  return data as {
    lesson_title: string;
    subject: string | null;
    summary: string;
    transcript: string | null;
  };
}

/** Gera flashcards ou questões a partir do resumo + transcrição de uma aula. */
export const generateFromLessonSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ data, context }) => {
    const count = data.count ?? 25;
    const lesson = await loadSummary(context.supabase, data.lessonId);
    const base = `Aula: ${lesson.lesson_title}${lesson.subject ? ` (${lesson.subject})` : ""}

RESUMO DA AULA:
"""
${lesson.summary}
"""

TRANSCRIÇÃO DA AULA:
"""
${(lesson.transcript ?? "").slice(0, MAX_TRANSCRIPT)}
"""`;

    if (data.kind === "flashcards") {
      const existing = await loadExisting(
        context.supabase,
        "flashcards",
        "front",
        data.subjectId,
        data.lessonId,
      );
      const parsed = await aiJson<{ cards?: { front?: string; back?: string }[] }>(
        "Você cria flashcards de estudo em português do Brasil para o ENEM e vestibulares, " +
          "fiéis ao conteúdo da aula enviada (resumo + transcrição), sem inventar informação. " +
          "A frente é uma pergunta direta (máx. 140 caracteres) e o verso é a resposta objetiva " +
          "(máx. 260 caracteres). Não repita perguntas. " +
          'Formato: {"cards":[{"front":"...","back":"..."}]}.',
        [
          {
            type: "text",
            text: `Gere ${count} flashcards INÉDITOS a partir desta aula.${avoidBlock(existing.texts)}\n\n${base}`,
          },
        ],
      );

      const cards = (parsed.cards ?? [])
        .map((c) => ({ front: String(c?.front ?? "").trim(), back: String(c?.back ?? "").trim() }))
        .filter((c) => c.front && c.back)
        .filter((c) => {
          const key = normalizeText(c.front);
          if (!key || existing.keys.has(key)) return false;
          existing.keys.add(key);
          return true;
        })
        .slice(0, count);
      if (cards.length === 0)
        throw new Error("A IA não encontrou conteúdo novo — todos os cartões já existiam.");

      const { error } = await context.supabase.from("flashcards").insert(
        cards.map((c) => ({
          user_id: context.userId,
          subject_id: data.subjectId,
          lesson_id: data.lessonId,
          front: c.front,
          back: c.back,
        })),
      );
      if (error) throw new Error("Os cartões foram gerados, mas não puderam ser salvos.");
      return { created: cards.length, kind: "flashcards" as const };
    }

    const existing = await loadExisting(
      context.supabase,
      "quiz_questions",
      "question",
      data.subjectId,
      data.lessonId,
    );
    const parsed = await aiJson<{
      questions?: {
        question?: string;
        options?: unknown[];
        correct_index?: number;
        explanation?: string;
      }[];
    }>(
      "Você cria questões de múltipla escolha em português do Brasil para o ENEM e vestibulares, " +
        "fiéis ao conteúdo da aula enviada (resumo + transcrição), sem inventar informação. " +
        "Enunciado conciso (máx. 220 caracteres), exatamente 4 alternativas curtas e plausíveis, " +
        "apenas uma correta, e explicação objetiva (máx. 220 caracteres). " +
        'Formato: {"questions":[{"question":"...","options":["a","b","c","d"],"correct_index":0,"explanation":"..."}]}.',
      [
        {
          type: "text",
          text: `Gere ${count} questões INÉDITAS a partir desta aula.${avoidBlock(existing.texts)}\n\n${base}`,
        },
      ],
    );

    const questions = (parsed.questions ?? [])
      .map((q) => {
        const options = Array.isArray(q?.options)
          ? q.options.map((o) => String(o ?? "").trim()).filter(Boolean)
          : [];
        const correct = Number(q?.correct_index ?? 0);
        return {
          question: String(q?.question ?? "").trim(),
          options,
          correct_index:
            Number.isInteger(correct) && correct >= 0 && correct < options.length ? correct : 0,
          explanation: q?.explanation ? String(q.explanation).trim() : null,
        };
      })
      .filter((q) => q.question && q.options.length >= 2)
      .filter((q) => {
        const key = normalizeText(q.question);
        if (!key || existing.keys.has(key)) return false;
        existing.keys.add(key);
        return true;
      })
      .slice(0, count);
    if (questions.length === 0)
      throw new Error("A IA não encontrou conteúdo novo — todas as questões já existiam.");

    const { error } = await context.supabase.from("quiz_questions").insert(
      questions.map((q) => ({
        user_id: context.userId,
        subject_id: data.subjectId,
        lesson_id: data.lessonId,
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation,
      })),
    );
    if (error) throw new Error("As questões foram geradas, mas não puderam ser salvas.");
    return { created: questions.length, kind: "quiz" as const };
  });
