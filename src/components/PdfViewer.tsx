import { useEffect, useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getOneDriveFileUrl } from "@/lib/onedrive.functions";

export type PdfTarget = {
  title: string;
  /** Caminho no bucket "materiais" (gera URL assinada) */
  path?: string | null;
  /** Ou uma URL direta já acessível */
  url?: string | null;
  /** Ou o id do item no OneDrive (link é gerado na hora, pois expira) */
  externalId?: string | null;
  /** Drive do item, quando não está no drive padrão (ex.: pasta compartilhada) */
  driveId?: string | null;
};

/** Conteúdo do visualizador de PDF (usado dentro do painel dividido). */
export function PdfPane({ target }: { target: PdfTarget }) {
  const [src, setSrc] = useState<string | null>(null);
  const [remote, setRemote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1) descobre a URL do arquivo
  useEffect(() => {
    let active = true;
    setSrc(null);
    setRemote(null);
    setError(null);

    async function resolve() {
      if (target.url) return target.url;
      if (target.externalId) {
        const { url } = await getOneDriveFileUrl({
          data: target.driveId
            ? { itemId: target.externalId, driveId: target.driveId }
            : { itemId: target.externalId },
        });
        return url;
      }
      if (target.path) {
        const { data, error: err } = await supabase.storage
          .from("materiais")
          .createSignedUrl(target.path, 3600);
        if (err || !data) throw new Error("signed url");
        return data.signedUrl;
      }
      throw new Error("sem arquivo");
    }

    resolve()
      .then((url) => active && setRemote(url))
      .catch(() => active && setError("Não foi possível abrir este arquivo."));

    return () => {
      active = false;
    };
  }, [target.path, target.url, target.externalId, target.driveId]);

  // 2) baixa como blob para exibir inline (evita bloqueio de iframe/download forçado)
  useEffect(() => {
    if (!remote) return;
    let active = true;
    let objectUrl: string | null = null;

    fetch(remote)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("fetch"))))
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(
          blob.type ? blob : new Blob([blob], { type: "application/pdf" }),
        );
        setSrc(objectUrl);
      })
      .catch(() => {
        // fallback: tenta direto no iframe
        if (active) setSrc(remote);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [remote]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {remote && (
        <div className="flex items-center gap-3 border-b border-line px-4 py-1.5">
          <a
            href={remote}
            download={target.title}
            className="flex items-center gap-1 font-mono text-[11px] text-ink-soft transition-colors hover:text-sun-deep"
          >
            baixar <Download className="size-3.5" />
          </a>
          <a
            href={remote}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-mono text-[11px] text-ink-soft transition-colors hover:text-sun-deep"
          >
            nova aba <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {error ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-ink-soft">
            {error}
          </div>
        ) : src ? (
          <object data={src} type="application/pdf" className="size-full bg-white">
            <iframe src={src} title={target.title} className="size-full border-0 bg-white" />
          </object>
        ) : (
          <div className="grid h-full place-items-center gap-2 text-sm text-ink-soft">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
