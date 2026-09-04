import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiJson, toDataUrl } from "./exam-ai.server";

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lê um edital (PDF salvo em materials) e gera questões inéditas de múltipla
 * escolha sobre os conteúdos cobrados, evitando repetir questões já existentes.
 */
export const generateFromEdital = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        materialId: z.string().uuid(),
        count: z.number().int().min(3).max(25).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const count = data.count ?? 15;

    const { data: material, error } = await supabase
      .from("materials")
      .select("id, subject_id, title, file_path")
      .eq("id", data.materialId)
      .single();
    if (error || !material) throw new Error("Edital não encontrado.");
    if (!material.file_path) throw new Error("Este edital não tem arquivo PDF anexado.");

    const { data: subject } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", material.subject_id)
      .maybeSingle();

    const file = await supabase.storage.from("materiais").download(material.file_path);
    if (file.error || !file.data) throw new Error("Não foi possível ler o PDF do edital.");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    if (bytes.length === 0) throw new Error("O arquivo do edital está vazio.");
    const mime = file.data.type || "application/pdf";

    const { data: existingRows } = await supabase
      .from("quiz_questions")
      .select("question")
      .eq("subject_id", material.subject_id)
      .limit(400);
    const existingKeys = new Set(
      (existingRows ?? []).map((r) => normalizeText(String(r.question ?? ""))).filter(Boolean),
    );
    const avoid =
      existingKeys.size === 0
        ? ""
        : `\n\nEstas questões JÁ existem e NÃO podem ser repetidas:\n${(existingRows ?? [])
            .slice(-100)
            .map((r) => `- ${String(r.question ?? "").slice(0, 160)}`)
            .join("\n")}`;

    const parsed = await aiJson<{
      questions?: {
        question?: string;
        options?: unknown[];
        correct_index?: number;
        explanation?: string;
      }[];
    }>(
      "Você cria questões de múltipla escolha em português do Brasil no estilo ENEM/vestibular, " +
        `com base nos conteúdos que o edital em anexo cobra para a matéria "${subject?.name ?? "geral"}". ` +
        "Crie questões INÉDITAS sobre os tópicos listados no edital: enunciado conciso (máx. 220 caracteres), " +
        "exatamente 4 alternativas curtas e plausíveis, apenas uma correta, e explicação objetiva (máx. 220 caracteres). " +
        'Formato: {"questions":[{"question":"...","options":["a","b","c","d"],"correct_index":0,"explanation":"..."}]}.',
      [
        { type: "file", file: { filename: material.title, file_data: toDataUrl(bytes, mime) } },
        { type: "text", text: `Gere ${count} questões sobre os conteúdos deste edital.${avoid}` },
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
        if (!key || existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      })
      .slice(0, count);

    if (questions.length === 0)
      throw new Error("A IA não encontrou conteúdo novo no edital — as questões já existiam.");

    const { error: insertError } = await supabase.from("quiz_questions").insert(
      questions.map((q) => ({
        user_id: userId,
        subject_id: material.subject_id,
        lesson_id: null,
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation,
      })),
    );
    if (insertError) throw new Error("As questões foram geradas, mas não puderam ser salvas.");

    return { created: questions.length };
  });
