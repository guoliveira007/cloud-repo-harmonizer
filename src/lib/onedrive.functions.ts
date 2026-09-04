import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_onedrive/v1.0";

/** Pasta compartilhada configurada para o fichário (link 1drv.ms do usuário). */
export const SHARED_FOLDER_URL =
  "https://1drv.ms/f/c/94358144d9c0b85a/IgCdnjmbRR8dSol59LEDf1foAZDD7OBh-0FBUR0M9UDtb4w?e=TMa8gU";

export type DriveItem = {
  id: string;
  name: string;
  isFolder: boolean;
  childCount: number;
  size: number;
  mimeType: string | null;
  path: string;
  driveId: string | null;
};

function sanitizePath(raw: string) {
  const path = raw.replace(/^\/+|\/+$/g, "");
  if (!path) return "";
  if (path.includes("..") || path.includes(":")) {
    throw new Error("Caminho inválido.");
  }
  return path;
}

function sanitizeId(raw: string, label: string) {
  const value = String(raw ?? "");
  if (!/^[A-Za-z0-9!._-]+$/.test(value)) throw new Error(`${label} inválido.`);
  return value;
}

async function graph(path: string, init?: RequestInit) {
  const apiKey = process.env["MICROSOFT_ONEDRIVE_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey || !lovableKey) throw new Error("Conexão com o OneDrive não está configurada.");

  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`OneDrive gateway failed [${res.status}]: ${body}`);
    throw new Error(`OneDrive respondeu ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<Record<string, any>>;
}

/** Codifica um link de compartilhamento no formato esperado pela API de shares do Graph. */
function encodeShareToken(shareUrl: string) {
  const url = shareUrl.trim();
  if (!/^https:\/\/(1drv\.ms|onedrive\.live\.com)\//.test(url)) {
    throw new Error("Link de compartilhamento do OneDrive inválido.");
  }
  const base64 = Buffer.from(url, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `u!${base64}`;
}

function mapItem(raw: Record<string, any>, basePath: string, driveId: string | null): DriveItem {
  return {
    id: String(raw["id"]),
    name: String(raw["name"]),
    isFolder: !!raw["folder"],
    childCount: raw["folder"]?.childCount ?? 0,
    size: Number(raw["size"] ?? 0),
    mimeType: raw["file"]?.mimeType ?? null,
    path: basePath ? `${basePath}/${raw["name"]}` : String(raw["name"]),
    driveId,
  };
}

function sortItems(items: DriveItem[]) {
  items.sort((a, b) =>
    a.isFolder === b.isFolder ? a.name.localeCompare(b.name, "pt-BR") : a.isFolder ? -1 : 1,
  );
  return items;
}

/** Resolve o link compartilhado para descobrir drive e item reais da pasta. */
export const resolveOneDriveShare = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { shareUrl?: string }) => ({
    shareUrl: String(input?.shareUrl ?? SHARED_FOLDER_URL),
  }))
  .handler(async ({ data }) => {
    const token = encodeShareToken(data.shareUrl);
    const json = await graph(
      `/shares/${token}/driveItem?$select=id,name,folder,parentReference`,
    );
    const driveId = String(json["parentReference"]?.["driveId"] ?? "");
    if (!driveId) throw new Error("Não foi possível localizar o drive da pasta compartilhada.");
    return {
      driveId,
      itemId: String(json["id"]),
      name: String(json["name"] ?? "Pasta compartilhada"),
      isFolder: !!json["folder"],
    };
  });

export const listOneDriveFolder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path?: string; driveId?: string; itemId?: string }) => ({
    path: sanitizePath(input?.path ?? ""),
    driveId: input?.driveId ? sanitizeId(input.driveId, "Drive") : null,
    itemId: input?.itemId ? sanitizeId(input.itemId, "Item") : null,
  }))
  .handler(async ({ data }) => {
    let target: string;
    let basePath: string;
    let driveId: string | null = null;

    if (data.driveId && data.itemId) {
      // Pasta identificada por drive+item (ex.: pasta compartilhada)
      target = `/drives/${data.driveId}/items/${data.itemId}/children`;
      basePath = data.path;
      driveId = data.driveId;
    } else if (data.path) {
      const encoded = data.path.split("/").map(encodeURIComponent).join("/");
      target = `/me/drive/root:/${encoded}:/children`;
      basePath = data.path;
    } else {
      target = "/me/drive/root/children";
      basePath = "";
    }

    const json = await graph(`${target}?$top=200&$select=id,name,folder,file,size&$orderby=name`);
    const items: DriveItem[] = sortItems(
      (json["value"] ?? []).map((raw: Record<string, any>) => mapItem(raw, basePath, driveId)),
    );
    return { path: data.path, items };
  });

export const getOneDriveFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string; driveId?: string }) => ({
    itemId: sanitizeId(input?.itemId ?? "", "Arquivo"),
    driveId: input?.driveId ? sanitizeId(input.driveId, "Drive") : null,
  }))
  .handler(async ({ data }) => {
    const target = data.driveId
      ? `/drives/${data.driveId}/items/${data.itemId}`
      : `/me/drive/items/${data.itemId}`;
    const json = await graph(target);
    const url = json["@microsoft.graph.downloadUrl"] as string | undefined;
    if (!url) throw new Error("Não foi possível gerar o link do arquivo.");
    return { url, name: String(json["name"] ?? "arquivo") };
  });

/** Sobe um arquivo (até ~10 MB) para a pasta atual — raiz, caminho ou pasta compartilhada. */
export const uploadOneDriveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    path?: string;
    driveId?: string;
    itemId?: string;
    fileName: string;
    contentBase64: string;
    contentType?: string;
  }) => {
    const fileName = String(input?.fileName ?? "").replace(/[\\/:*?"<>|]/g, "").trim();
    if (!fileName) throw new Error("Nome de arquivo inválido.");
    const contentBase64 = String(input?.contentBase64 ?? "");
    if (!contentBase64) throw new Error("Arquivo vazio.");
    if (contentBase64.length > 14 * 1024 * 1024) {
      throw new Error("Arquivo muito grande (máximo de 10 MB).");
    }
    return {
      path: sanitizePath(input?.path ?? ""),
      driveId: input?.driveId ? sanitizeId(input.driveId, "Drive") : null,
      itemId: input?.itemId ? sanitizeId(input.itemId, "Item") : null,
      fileName,
      contentBase64,
      contentType: String(input?.contentType ?? "application/octet-stream"),
    };
  })
  .handler(async ({ data }) => {
    const buffer = Buffer.from(data.contentBase64, "base64");
    const name = encodeURIComponent(data.fileName);

    let target: string;
    if (data.driveId && data.itemId) {
      target = `/drives/${data.driveId}/items/${data.itemId}:/${name}:/content`;
    } else if (data.path) {
      const encoded = data.path.split("/").map(encodeURIComponent).join("/");
      target = `/me/drive/root:/${encoded}/${name}:/content`;
    } else {
      target = `/me/drive/root:/${name}:/content`;
    }

    const json = await graph(target, {
      method: "PUT",
      headers: { "Content-Type": data.contentType },
      body: new Uint8Array(buffer),
    });
    return {
      id: String(json["id"]),
      name: String(json["name"] ?? data.fileName),
      size: Number(json["size"] ?? buffer.length),
    };
  });
