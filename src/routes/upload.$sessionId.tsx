import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Camera, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { transcribeSolutionPhoto } from "@/lib/photo.functions";

export const Route = createFileRoute("/upload/$sessionId")({
  head: () => ({
    meta: [
      { title: "Enviar foto da resolução — Fichário" },
      { name: "description", content: "Fotografe sua resolução para transcrever no computador." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UploadPhotoPage,
});

type Stage = "loading" | "anon" | "invalid" | "ready" | "uploading" | "transcribing" | "done" | "error";

/** Página enxuta para o celular: abre pelo QR, fotografa a resolução e envia. */
function UploadPhotoPage() {
  const { sessionId } = Route.useParams();
  const transcribe = useServerFn(transcribeSolutionPhoto);
  const [stage, setStage] = useState<Stage>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (!cancelled) setStage("anon");
        return;
      }
      const { data } = await supabase
        .from("upload_sessions")
        .select("id, status")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) setStage("invalid");
      else if (data.status === "processed") setStage("done");
      else setStage("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function onFile(file: File) {
    setStage("uploading");
    setMessage("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre de novo no celular.");

      const ext = file.type.includes("png") ? "png" : "jpg";
      const path = `${uid}/${sessionId}.${ext}`;
      const { error: upError } = await supabase.storage
        .from("resolucoes")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (upError) throw upError;

      const { error: updError } = await supabase
        .from("upload_sessions")
        .update({ status: "uploaded", photo_path: path })
        .eq("id", sessionId);
      if (updError) throw updError;

      setStage("transcribing");
      await transcribe({ data: { sessionId } });
      setStage("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
      setStage("error");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-ink">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-md bg-sun font-display text-lg font-bold text-primary-foreground">
          F
        </span>
        <h1 className="mt-3 font-display text-xl font-bold tracking-tight">Foto da resolução</h1>

        {stage === "loading" && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-soft">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </p>
        )}

        {stage === "anon" && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink-soft">
              Entre na sua conta neste celular para enviar a foto.
            </p>
            <Link
              to="/entrar"
              className="inline-block rounded-md bg-sun px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Entrar
            </Link>
          </div>
        )}

        {stage === "invalid" && (
          <p className="mt-4 text-sm text-ink-soft">
            Este link de envio não existe ou já expirou. Gere um novo QR no computador.
          </p>
        )}

        {stage === "ready" && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-ink-soft">
              Fotografe a resolução que você fez no papel. O texto aparece no computador.
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-paper px-4 py-10 text-sm transition-colors hover:border-sun">
              <Camera className="size-8 text-sun-deep" />
              <span className="font-medium">Tirar foto / escolher imagem</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}

        {(stage === "uploading" || stage === "transcribing") && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-soft">
            <Loader2 className="size-4 animate-spin" />
            {stage === "uploading" ? "Enviando a foto…" : "Transcrevendo o que você escreveu…"}
          </p>
        )}

        {stage === "done" && (
          <div className="mt-4 space-y-2">
            <CheckCircle2 className="mx-auto size-8 text-sun-deep" />
            <p className="text-sm font-medium">Pronto!</p>
            <p className="text-sm text-ink-soft">
              A transcrição já está na tela do computador. Pode fechar esta página.
            </p>
          </div>
        )}

        {stage === "error" && (
          <div className="mt-4 space-y-3">
            <XCircle className="mx-auto size-8 text-destructive" />
            <p className="text-sm text-ink-soft">{message || "Algo deu errado."}</p>
            <button
              onClick={() => setStage("ready")}
              className="rounded-md bg-sun px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Tentar de novo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
