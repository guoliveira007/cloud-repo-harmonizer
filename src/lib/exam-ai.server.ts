const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export class AiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function callGateway(messages: unknown[]): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiError(500, "A IA não está configurada neste projeto.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({ model: MODEL, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429)
      throw new AiError(429, "Muitas requisições à IA agora. Tente novamente em alguns instantes.");
    if (res.status === 402)
      throw new AiError(
        402,
        "Os créditos de IA acabaram. Recarregue para continuar usando a correção automática.",
      );
    throw new AiError(res.status, `Falha na IA (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

export async function aiText(system: string, parts: ContentPart[]): Promise<string> {
  return callGateway([
    { role: "system", content: system },
    { role: "user", content: parts },
  ]);
}

export async function aiJson<T>(system: string, parts: ContentPart[]): Promise<T> {
  const raw = await aiText(
    `${system}\n\nResponda SOMENTE com JSON válido, sem comentários e sem blocos de código.`,
    parts,
  );
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    return JSON.parse(slice) as T;
  } catch {
    throw new AiError(502, "A IA devolveu uma resposta em formato inesperado. Tente novamente.");
  }
}

export function toDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
