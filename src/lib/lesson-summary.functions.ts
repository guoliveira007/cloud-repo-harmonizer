import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiText } from "./exam-ai.server";

const MAX_CHARS = 120_000;

const SYSTEM = `Você é um professor experiente de cursinho pré-vestibular escrevendo uma APOSTILA da aula.
Receberá a TRANSCRIÇÃO COMPLETA de uma aula gravada e deve produzir um RESUMO MUITO DETALHADO em português do Brasil,
fiel ao que foi dito na aula (não invente conteúdo que não aparece na transcrição, mas explique melhor o que foi dito).

Regras de profundidade (obrigatórias):
- O texto final deve ser longo: no mínimo 1200 palavras (quando a transcrição permitir), aproveitando TUDO que é relevante.
- Nunca resuma um tópico em uma única linha: cada tópico precisa de explicação em parágrafos + listas.
- Preserve números, fórmulas, nomes, datas, exemplos, analogias e falas marcantes do professor.
- Explique o "porquê" de cada conceito, não apenas o "o quê".

Estruture o resumo em Markdown, exatamente nesta ordem:
1. "## Visão geral" — 4 a 6 linhas sobre o que a aula cobre e por que importa na prova.
2. "## Mapa da aula" — lista dos tópicos na ordem em que aparecem.
3. "## Conteúdo detalhado" — um subtítulo (###) para CADA bloco/tópico da aula, com:
   explicação aprofundada em parágrafos, definições formais, fórmulas (texto simples),
   demonstrações/derivações, macetes, analogias e observações do professor.
4. "## Exemplos e exercícios resolvidos" — passo a passo completo de cada exercício comentado (enunciado, raciocínio, resposta).
5. "## Pegadinhas e erros comuns" — alertas dados pelo professor e armadilhas típicas de prova.
6. "## Conexões com outros temas" — como o conteúdo se liga a outros tópicos da matéria.
7. "## Glossário" — termos técnicos citados, com definição curta.
8. "## Resumo relâmpago" — bullets curtos com os pontos que precisam ser decorados.
9. "## Perguntas de autoteste" — 5 a 8 perguntas (com a resposta logo abaixo, em itálico).

Seja detalhado e didático: o aluno deve conseguir estudar a aula inteira apenas pelo resumo, sem rever o vídeo.`;

/** Gera (ou regera) o resumo detalhado de uma aula a partir da transcrição enviada. */
export const generateLessonSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        lessonId: z.string().min(1),
        lessonTitle: z.string().min(1).max(300),
        subject: z.string().max(120).optional(),
        transcript: z.string().min(200, "A transcrição está curta demais."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const transcript = data.transcript.slice(0, MAX_CHARS);

    const summary = await aiText(SYSTEM, [
      {
        type: "text",
        text: `Aula: ${data.lessonTitle}${data.subject ? ` (${data.subject})` : ""}\n\nTranscrição:\n"""\n${transcript}\n"""`,
      },
    ]);

    if (!summary.trim()) throw new Error("A IA não conseguiu gerar o resumo. Tente novamente.");

    const { error } = await context.supabase.from("lesson_summaries").upsert(
      {
        user_id: context.userId,
        lesson_id: data.lessonId,
        lesson_title: data.lessonTitle,
        subject: data.subject ?? null,
        transcript,
        summary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lesson_id" },
    );
    if (error) throw new Error("Não foi possível salvar o resumo.");

    return { summary };
  });
