import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_onedrive/v1.0";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_BYTES = 15 * 1024 * 1024;

async function oneDriveDownloadUrl(itemId: string) {
  const apiKey = process.env["MICROSOFT_ONEDRIVE_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey || !lovableKey) throw new Error("Conexão com o OneDrive não está configurada.");
  const res = await fetch(`${GATEWAY_URL}/me/drive/items/${encodeURIComponent(itemId)}`, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": apiKey },
  });
  if (!res.ok) throw new Error("Não foi possível baixar o arquivo da nuvem.");
  const json = (await res.json()) as Record<string, any>;
  const url = json["@microsoft.graph.downloadUrl"] as string | undefined;
  if (!url) throw new Error("Não foi possível baixar o arquivo da nuvem.");
  return url;
}

type Draft = { front: string; back: string };

type QuizDraft = {
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
};

/** Baixa o PDF do material (Storage, OneDrive ou link) e devolve base64 + nome. */
async function loadMaterialPdf(supabase: any, materialId: string) {
  const { data: material, error } = await supabase
    .from("materials")
    .select("id,subject_id,lesson_id,lesson_ids,title,file_path,external_id,link_url,file_size")
    .eq("id", materialId)
    .maybeSingle();
  if (error || !material) throw new Error("Material não encontrado.");

  let fileUrl: string | null = null;
  if (material.file_path) {
    const signed = await supabase.storage.from("materiais").createSignedUrl(material.file_path, 600);
    fileUrl = signed.data?.signedUrl ?? null;
  } else if (material.external_id) {
    fileUrl = await oneDriveDownloadUrl(material.external_id);
  } else if (material.link_url) {
    fileUrl = material.link_url;
  }
  if (!fileUrl) throw new Error("Este material não tem arquivo para ler.");

  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error("Não foi possível baixar o arquivo.");
  const bytes = new Uint8Array(await fileRes.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("O arquivo está vazio.");
  if (bytes.byteLength > MAX_BYTES)
    throw new Error("Arquivo muito grande para a IA (limite de 15 MB).");

  const base64 = Buffer.from(bytes).toString("base64");
  const filename = material.title.toLowerCase().endsWith(".pdf")
    ? material.title
    : `${material.title}.pdf`;
  return { material, base64, filename };
}

/** Chama o gateway de IA com o PDF anexado e devolve o texto da resposta. */
async function askAiWithPdf(opts: {
  lovableKey: string;
  system: string;
  prompt: string;
  filename: string;
  base64: string;
}) {
  const aiRes = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages: [
        { role: "system", content: opts.system },
        {
          role: "user",
          content: [
            { type: "text", text: opts.prompt },
            {
              type: "file",
              file: {
                filename: opts.filename,
                file_data: `data:application/pdf;base64,${opts.base64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!aiRes.ok) {
    const body = await aiRes.text();
    console.error(`AI gateway ${aiRes.status}: ${body.slice(0, 500)}`);
    if (aiRes.status === 429)
      throw new Error("Muitas gerações seguidas. Tente novamente em alguns instantes.");
    if (aiRes.status === 402)
      throw new Error("Os créditos de IA do projeto acabaram. Adicione créditos para continuar.");
    throw new Error("A IA não conseguiu ler este arquivo agora.");
  }

  const json = (await aiRes.json()) as any;
  return String(json?.choices?.[0]?.message?.content ?? "");
}

function parseJsonBlock(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match ? match[0] : raw);
  } catch {
    throw new Error("A IA devolveu um formato inesperado. Tente de novo.");
  }
}

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

/** Busca os textos já gerados para o mesmo material/matéria, para evitar repetições. */
async function loadExisting(
  supabase: any,
  table: "quiz_questions" | "flashcards",
  column: "question" | "front",
  material: { subject_id: string; lesson_id: string | null },
) {
  let query = supabase.from(table).select(column).eq("subject_id", material.subject_id).limit(400);
  if (material.lesson_id) query = query.eq("lesson_id", material.lesson_id);
  const { data } = await query;
  const texts: string[] = (data ?? [])
    .map((row: any) => String(row?.[column] ?? "").trim())
    .filter(Boolean);
  return { texts, keys: new Set(texts.map(normalizeText)) };
}

function avoidBlock(texts: string[]) {
  if (texts.length === 0) return "";
  const list = texts.slice(-120).map((t) => `- ${t.slice(0, 160)}`).join("\n");
  return `\n\nEstes itens JÁ existem e NÃO podem ser repetidos (nem reformulados com as mesmas palavras). Crie conteúdo sobre outros pontos do material:\n${list}`;
}


/** Lê o PDF de um material e gera questões de múltipla escolha com IA. */
export const generateQuizFromMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { materialId: string; count?: number }) => {
    const materialId = String(input?.materialId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(materialId)) throw new Error("Material inválido.");
    const count = Math.min(Math.max(Number(input?.count ?? 25), 3), 25);
    return { materialId, count };
  })
  .handler(async ({ data, context }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    if (!lovableKey) throw new Error("A IA não está configurada neste projeto.");

    const { material, base64, filename } = await loadMaterialPdf(context.supabase, data.materialId);
    const existing = await loadExisting(context.supabase, "quiz_questions", "question", material);

    const raw = await askAiWithPdf({
      lovableKey,
      filename,
      base64,
      system:
        "Você cria questões de múltipla escolha em português do Brasil para o ENEM e vestibulares, " +
        "fiéis ao conteúdo do material enviado (nunca invente informação fora dele). " +
        "Cada questão tem enunciado conciso (máx. 220 caracteres), exatamente 4 alternativas curtas e " +
        "plausíveis, apenas uma correta, e uma explicação objetiva (máx. 220 caracteres). " +
        "Não repita questões e não cite páginas nem o nome do arquivo. " +
        'Responda SOMENTE com JSON no formato {"questions":[{"question":"...","options":["a","b","c","d"],"correct_index":0,"explanation":"..."}]}.',
      prompt:
        `Gere ${data.count} questões de múltipla escolha INÉDITAS a partir deste material de estudo.` +
        avoidBlock(existing.texts),
    });

    const parsed = parseJsonBlock(raw);
    const drafts: QuizDraft[] = Array.isArray(parsed?.questions) ? parsed.questions : [];


    const questions = drafts
      .map((q) => {
        const options = Array.isArray(q?.options)
          ? q.options.map((o) => String(o ?? "").trim()).filter(Boolean)
          : [];
        const correct = Number(q?.correct_index ?? 0);
        return {
          question: String(q?.question ?? "").trim(),
          options,
          correct_index: Number.isInteger(correct) && correct >= 0 && correct < options.length ? correct : 0,
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
      .slice(0, data.count);
    if (questions.length === 0)
      throw new Error("A IA não encontrou conteúdo novo neste PDF — todas as questões geradas já existiam.");


    const { error: insertError } = await context.supabase.from("quiz_questions").insert(
      questions.map((q) => ({
        user_id: context.userId,
        subject_id: material.subject_id,
        lesson_id: material.lesson_ids?.[0] ?? material.lesson_id ?? null,
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation,
      })),
    );
    if (insertError) throw new Error("As questões foram geradas, mas não puderam ser salvas.");

    return { created: questions.length };
  });

/** Lê o PDF de um material e gera flashcards objetivos com IA. */
export const generateFlashcardsFromMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { materialId: string; count?: number }) => {
    const materialId = String(input?.materialId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(materialId)) throw new Error("Material inválido.");
    const count = Math.min(Math.max(Number(input?.count ?? 25), 4), 25);
    return { materialId, count };
  })
  .handler(async ({ data, context }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    if (!lovableKey) throw new Error("A IA não está configurada neste projeto.");

    const { data: material, error } = await context.supabase
      .from("materials")
      .select("id,subject_id,lesson_id,lesson_ids,title,file_path,external_id,link_url,file_size")
      .eq("id", data.materialId)
      .maybeSingle();
    if (error || !material) throw new Error("Material não encontrado.");

    const existingCards = await loadExisting(context.supabase, "flashcards", "front", material);


    let fileUrl: string | null = null;
    if (material.file_path) {
      const signed = await context.supabase.storage
        .from("materiais")
        .createSignedUrl(material.file_path, 600);
      fileUrl = signed.data?.signedUrl ?? null;
    } else if (material.external_id) {
      fileUrl = await oneDriveDownloadUrl(material.external_id);
    } else if (material.link_url) {
      fileUrl = material.link_url;
    }
    if (!fileUrl) throw new Error("Este material não tem arquivo para ler.");

    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error("Não foi possível baixar o arquivo.");
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("O arquivo está vazio.");
    if (bytes.byteLength > MAX_BYTES)
      throw new Error("Arquivo muito grande para a IA (limite de 15 MB).");

    const base64 = Buffer.from(bytes).toString("base64");
    const filename = material.title.toLowerCase().endsWith(".pdf")
      ? material.title
      : `${material.title}.pdf`;

    const aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          {
            role: "system",
            content:
              "Você cria flashcards de estudo em português do Brasil para o ENEM e vestibulares. " +
              "Seja conciso e assertivo: a frente é uma pergunta direta (máx. 140 caracteres) e o verso " +
              "é a resposta objetiva (máx. 260 caracteres). Cubra os conceitos mais cobrados do material, " +
              "sem repetir perguntas e sem citar páginas ou o nome do arquivo. " +
              'Responda SOMENTE com JSON no formato {"cards":[{"front":"...","back":"..."}]}.',
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Gere ${data.count} flashcards INÉDITOS a partir deste material de estudo.` +
                  avoidBlock(existingCards.texts),
              },

              {
                type: "file",
                file: { filename, file_data: `data:application/pdf;base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const body = await aiRes.text();
      console.error(`AI gateway ${aiRes.status}: ${body.slice(0, 500)}`);
      if (aiRes.status === 429)
        throw new Error("Muitas gerações seguidas. Tente novamente em alguns instantes.");
      if (aiRes.status === 402)
        throw new Error("Os créditos de IA do projeto acabaram. Adicione créditos para continuar.");
      throw new Error("A IA não conseguiu ler este arquivo agora.");
    }

    const json = (await aiRes.json()) as any;
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    let drafts: Draft[] = [];
    try {
      const parsed = JSON.parse(match ? match[0] : raw);
      drafts = Array.isArray(parsed?.cards) ? parsed.cards : [];
    } catch {
      throw new Error("A IA devolveu um formato inesperado. Tente de novo.");
    }

    const cards = drafts
      .map((c) => ({ front: String(c?.front ?? "").trim(), back: String(c?.back ?? "").trim() }))
      .filter((c) => c.front && c.back)
      .filter((c) => {
        const key = normalizeText(c.front);
        if (!key || existingCards.keys.has(key)) return false;
        existingCards.keys.add(key);
        return true;
      })
      .slice(0, data.count);
    if (cards.length === 0)
      throw new Error("A IA não encontrou conteúdo novo neste PDF — todos os cartões gerados já existiam.");


    const { error: insertError } = await context.supabase.from("flashcards").insert(
      cards.map((c) => ({
        user_id: context.userId,
        subject_id: material.subject_id,
        lesson_id: material.lesson_ids?.[0] ?? material.lesson_id ?? null,
        front: c.front,
        back: c.back,
      })),
    );
    if (insertError) throw new Error("Os cartões foram gerados, mas não puderam ser salvos.");

    return { created: cards.length };
  });
