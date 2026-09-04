import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { aiJson, aiText, toDataUrl, type ContentPart } from "./exam-ai.server";

export type ExtractedQuestion = {
  number: number;
  subject: string | null;
  topic: string | null;
  statement: string | null;
  options: Record<string, string> | null;
  correct_answer: string | null;
};

async function fileParts(
  supabase: {
    storage: {
      from: (b: string) => { download: (p: string) => Promise<{ data: Blob | null; error: unknown }> };
    };
  },
  filePath: string,
): Promise<ContentPart> {
  const { data, error } = await supabase.storage.from("exam-files").download(filePath);
  if (error || !data) throw new Error("Não foi possível ler o arquivo enviado.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length === 0) throw new Error("O arquivo enviado está vazio.");
  const mime = data.type && data.type !== "" ? data.type : "application/pdf";
  const name = filePath.split("/").pop() ?? "arquivo.pdf";
  return { type: "file", file: { filename: name, file_data: toDataUrl(bytes, mime) } };
}

/** Lê o PDF da prova e extrai as questões. */
export const extractExamQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ filePath: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const part = await fileParts(context.supabase, data.filePath);
    const result = await aiJson<{ questions?: ExtractedQuestion[] }>(
      `Você é um assistente que lê provas de vestibulares e simulados em PDF.
Extraia TODAS as questões objetivas encontradas, em ordem.
Para cada questão devolva:
- number: número da questão (inteiro)
- subject: a matéria (ex.: "Matemática", "Português", "História", "Biologia")
- topic: o assunto específico (ex.: "Função quadrática", "Concordância verbal")
- statement: o enunciado resumido em no máximo 400 caracteres
- options: objeto com as alternativas, ex.: {"A":"...","B":"..."} (use null se não conseguir ler)
- correct_answer: a letra correta se e somente se o PDF trouxer o gabarito; caso contrário null
Formato: {"questions":[...]}`,
      [part, { type: "text", text: "Extraia as questões desta prova." }],
    );
    const questions = (result.questions ?? []).filter((q) => Number.isFinite(q.number));
    return { questions };
  });

/** Lê o PDF do gabarito oficial e extrai as letras. */
export const extractAnswerKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ filePath: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const part = await fileParts(context.supabase, data.filePath);
    const result = await aiJson<{ answers?: Array<{ number: number; answer: string }> }>(
      `Você lê gabaritos oficiais de provas. Extraia o número de cada questão e a letra correta.
Formato: {"answers":[{"number":1,"answer":"C"}]}. Use letras maiúsculas (A-E). Ignore questões anuladas ou marque answer como "ANULADA".`,
      [part, { type: "text", text: "Extraia o gabarito oficial deste arquivo." }],
    );
    const answers = (result.answers ?? [])
      .filter((a) => Number.isFinite(a.number) && typeof a.answer === "string")
      .map((a) => ({ number: Number(a.number), answer: a.answer.trim().toUpperCase() }));
    return { answers };
  });

const ERROR_TYPES = [
  "Falta de conteúdo",
  "Desatenção",
  "Interpretação",
  "Erro de conta",
  "Chute",
  "Falta de tempo",
] as const;

function normalizeErrorType(value: string | null | undefined): string {
  if (!value) return "Interpretação";
  const cleaned = value.trim().toLowerCase();
  const match = ERROR_TYPES.find((t) => t.toLowerCase() === cleaned);
  return match ?? "Interpretação";
}

function clamp(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

const ALLOWED_SVG_TAGS = new Set([
  "svg", "g", "path", "line", "polyline", "polygon", "rect", "circle", "ellipse",
  "text", "tspan", "defs", "marker", "lineargradient", "radialgradient", "stop", "title",
]);

/** Mantém apenas SVG estático e seguro (sem script, eventos ou conteúdo externo). */
export function sanitizeSvg(input: string | null): string | null {
  if (!input) return null;
  let svg = input.trim().replace(/^```(?:svg|xml|html)?/i, "").replace(/```$/, "").trim();
  const start = svg.indexOf("<svg");
  const end = svg.lastIndexOf("</svg>");
  if (start < 0 || end < 0) return null;
  svg = svg.slice(start, end + 6);

  if (/\son[a-z]+\s*=/i.test(svg)) return null;
  if (/javascript:/i.test(svg)) return null;

  const tags = [...svg.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/g)].map((m) => m[1]!.toLowerCase());
  if (tags.some((t) => !ALLOWED_SVG_TAGS.has(t))) return null;
  if (svg.length > 40000) return null;
  return svg;
}

/** Analisa o raciocínio do usuário em uma questão errada. */
export const analyzeError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        questionId: z.string().uuid(),
        explanation: z.string().trim().min(5).max(3000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: question, error } = await supabase
      .from("exam_questions")
      .select("id, number, subject, topic, statement, options, correct_answer, user_answer")
      .eq("id", data.questionId)
      .single();
    if (error || !question) throw new Error("Questão não encontrada.");

    const VISUAL_SUBJECTS =
      /matem|f[ií]sic|qu[ií]mic|biolog|geograf|geometr|estat|trigonom|c[aá]lculo/i;
    const needsVisual = VISUAL_SUBJECTS.test(`${question.subject ?? ""} ${question.topic ?? ""}`);

    const analysis = await aiJson<{
      why_wrong: string;
      correct_reasoning: string;
      error_type: string;
      concept: string;
      visual_svg?: string | null;
      visual_caption?: string | null;
    }>(
      `Você é um professor particular de simulados em português do Brasil. O aluno errou uma questão de múltipla escolha e explicou o raciocínio que o levou à alternativa marcada. Seja cirúrgico: mostre exatamente onde o pensamento dele saiu do trilho e qual é o caminho certo.

Regras para cada campo:
- why_wrong: ataque DIRETAMENTE o raciocínio descrito pelo aluno. Cite trechos da explicação dele quando possível. Identifique a confusão conceitual específica ou o passo que ele pulou. Sem conselhos genéricos. 2 a 4 frases.
- correct_reasoning: caminho correto em passos numerados e curtos, do enunciado até a alternativa certa. Se for cálculo, mostre a conta. 3 a 6 passos.
- error_type: exatamente um destes valores: ${ERROR_TYPES.join(" | ")}
- concept: o conceito específico que o aluno deve revisar (máximo 6 palavras).
- visual_svg: ${
        needsVisual
          ? `OBRIGATÓRIO para esta matéria. Um desenho explicativo em SVG puro e autocontido que ilustre o conceito ou o passo a passo correto.
  Regras do SVG: comece com <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" width="100%">; use apenas as tags svg, g, path, line, polyline, polygon, rect, circle, ellipse, text, tspan, defs, marker, linearGradient, stop; NUNCA use script, image, foreignObject, style externo nem eventos on*.
  Cores: use APENAS currentColor (texto), var(--color-sun) (destaque), var(--color-sun-deep) (apoio), var(--color-destructive) (errado) e var(--color-muted-foreground) (eixos). Fundo transparente. Texto com font-size entre 11 e 14 e fill="currentColor".
  Rotule eixos, pontos e valores relevantes.`
          : `use null (matéria não exige desenho)`
      }
- visual_caption: legenda curta explicando o desenho (ou null se não houver)

Se a resposta_do_aluno for nula ou vazia, trate como questão em branco e explique o que ele deveria ter notado.`,
      [
        {
          type: "text",
          text: JSON.stringify({
            questao: question.number,
            materia: question.subject,
            assunto: question.topic,
            enunciado: question.statement,
            alternativas: question.options,
            gabarito_oficial: question.correct_answer,
            resposta_do_aluno: question.user_answer,
            explicacao_do_aluno: data.explanation,
          }),
        },
      ],
    );

    const visualSvg = sanitizeSvg(analysis.visual_svg ?? null);
    const whyWrong =
      clamp(analysis.why_wrong, 1200) ??
      "Não foi possível identificar o erro específico no raciocínio descrito.";
    const correctReasoning =
      clamp(analysis.correct_reasoning, 2000) ??
      "Revise o enunciado e o gabarito oficial para reconstruir o raciocínio correto.";
    const visualCaption = visualSvg ? clamp(analysis.visual_caption, 300) : null;

    const { data: saved, error: saveError } = await supabase
      .from("error_reviews")
      .upsert(
        {
          question_id: question.id,
          user_id: userId,
          user_explanation: data.explanation,
          why_wrong: whyWrong,
          correct_reasoning: correctReasoning,
          error_type: normalizeErrorType(analysis.error_type),
          concept: clamp(analysis.concept, 100) ?? "Revisar o assunto da questão",
          visual_svg: visualSvg,
          visual_caption: visualCaption,
        },
        { onConflict: "question_id" },
      )
      .select()
      .single();
    if (saveError) throw new Error(saveError.message);
    return saved;
  });

/** Gera um plano de revisão a partir dos erros recentes (ou de um simulado específico). */
export const generateStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ examId: z.string().uuid().optional() }).optional().parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const examId = data?.examId;

    let examsQuery = supabase
      .from("exams")
      .select("id, title, exam_date, total_questions, correct_count")
      .eq("user_id", userId)
      .order("exam_date", { ascending: false });
    examsQuery = examId ? examsQuery.eq("id", examId) : examsQuery.limit(8);
    const { data: exams } = await examsQuery;

    const examIds = (exams ?? []).map((e) => e.id);
    if (examIds.length === 0)
      throw new Error("Cadastre pelo menos um simulado antes de gerar o plano.");

    const { data: wrong } = await supabase
      .from("exam_questions")
      .select("id, subject, topic, correct_answer, user_answer, exam_id")
      .in("exam_id", examIds)
      .eq("is_correct", false);

    let reviewsQuery = supabase
      .from("error_reviews")
      .select("error_type, concept, question_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(120);
    const wrongIds = (wrong ?? []).map((q) => q.id);
    if (examId) {
      if (wrongIds.length === 0) reviewsQuery = reviewsQuery.limit(0);
      else reviewsQuery = reviewsQuery.in("question_id", wrongIds);
    }
    const { data: reviews } = await reviewsQuery;

    const { data: subjectRows } = await supabase
      .from("subjects")
      .select("id, name, parent_id")
      .eq("user_id", userId);
    const subjectList = (subjectRows ?? []).map((s) => ({
      id: s.id,
      nome: s.parent_id
        ? `${(subjectRows ?? []).find((p) => p.id === s.parent_id)?.name ?? ""} · ${s.name}`
        : s.name,
      link: `/materia/${s.id}`,
    }));

    const linkRule = `
Sempre que citar uma matéria ou frente que exista na lista "materias_do_fichario", transforme o nome em link markdown usando o campo "link" (ex.: [Biologia · Frente 2](/materia/uuid)). Nunca invente links.`;


    const plan = await aiText(
      examId
        ? `Você é um mentor de estudos. Escreva, em português do Brasil e em markdown, um plano de revisão focado APENAS neste simulado que o aluno acabou de corrigir.
Estrutura obrigatória:
## Diagnóstico deste simulado
## Prioridades de revisão (lista numerada: matéria, assunto e o motivo)
## Como estudar cada prioridade
## O que treinar antes do próximo simulado
Seja específico e curto: no máximo 350 palavras. Use listas e **negrito** nos assuntos.${linkRule}`
        : `Você é um mentor de estudos. Com base no desempenho recente do aluno, escreva um plano de revisão em português do Brasil, em markdown simples.
Estrutura obrigatória:
## Diagnóstico
## Prioridades da semana (lista numerada com matéria, assunto e o motivo)
## Como estudar cada prioridade
## Hábitos para corrigir (baseado nos tipos de erro)
Seja específico e curto: no máximo 400 palavras. Use listas e **negrito** nos assuntos.${linkRule}`,
      [
        {
          type: "text",
          text: JSON.stringify({
            simulados: exams,
            questoes_erradas: wrong ?? [],
            revisoes: reviews ?? [],
            materias_do_fichario: subjectList,
          }),
        },
      ],

    );

    const { data: saved, error } = await supabase
      .from("study_plans")
      .insert({ user_id: userId, content: plan, exam_id: examId ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });
