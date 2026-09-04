import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiText, toDataUrl } from "./exam-ai.server";

/**
 * Transcreve a foto da resolução manuscrita.
 * Só transcreve — o diagnóstico continua sendo trabalho da analyzeError.
 */
export const transcribeSolutionPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: session, error } = await supabase
      .from("upload_sessions")
      .select("id, photo_path, status, transcript")
      .eq("id", data.sessionId)
      .single();
    if (error || !session) throw new Error("Sessão de envio não encontrada.");
    if (session.status === "processed" && session.transcript)
      return { transcript: session.transcript };
    if (!session.photo_path) throw new Error("Nenhuma foto foi enviada ainda.");

    const file = await supabase.storage.from("resolucoes").download(session.photo_path);
    if (file.error || !file.data) throw new Error("Não foi possível ler a foto enviada.");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    if (bytes.length === 0) throw new Error("A foto enviada está vazia.");
    const mime = file.data.type && file.data.type !== "" ? file.data.type : "image/jpeg";

    let transcript = "";
    try {
      transcript = await aiText(
        `Você transcreve resoluções manuscritas de estudantes, em português do Brasil.
Devolva SOMENTE a transcrição fiel do que está escrito na foto: contas, passos, anotações e o raciocínio do aluno, na ordem em que aparecem.
Use texto simples (fórmulas em linha, ex.: "x^2 + 3x = 10"). Não corrija, não avalie, não explique e não comente — apenas transcreva.
Se algum trecho estiver ilegível, escreva [ilegível].`,
        [
          { type: "image_url", image_url: { url: toDataUrl(bytes, mime) } },
          { type: "text", text: "Transcreva a resolução escrita nesta foto." },
        ],
      );
    } catch (err) {
      await supabase
        .from("upload_sessions")
        .update({ status: "error", error: err instanceof Error ? err.message : "Falha na leitura." })
        .eq("id", session.id);
      throw err;
    }

    // A foto é descartada assim que vira texto.
    await supabase.storage.from("resolucoes").remove([session.photo_path]);

    const clean = transcript.trim().slice(0, 3000);
    await supabase
      .from("upload_sessions")
      .update({ status: "processed", transcript: clean, photo_path: null })
      .eq("id", session.id);

    return { transcript: clean };
  });
