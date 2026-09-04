import { jsPDF } from "jspdf";

/** Paleta fixa do estilo dos resumos (golden hour). */
const INK: [number, number, number] = [38, 34, 30];
const SOFT: [number, number, number] = [104, 96, 88];
const SUN: [number, number, number] = [201, 132, 34];
const LINE: [number, number, number] = [223, 214, 201];

const PAGE_W = 595.28; // A4 em pt
const PAGE_H = 841.89;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

type Segment = { text: string; bold: boolean; italic: boolean };

function parseInline(raw: string): Segment[] {
  const out: Segment[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m.index > last) out.push({ text: raw.slice(last, m.index), bold: false, italic: false });
    const t = m[0];
    if (t.startsWith("**")) out.push({ text: t.slice(2, -2), bold: true, italic: false });
    else if (t.startsWith("`")) out.push({ text: t.slice(1, -1), bold: false, italic: false });
    else out.push({ text: t.slice(1, -1), bold: false, italic: true });
    last = m.index + t.length;
  }
  if (last < raw.length) out.push({ text: raw.slice(last), bold: false, italic: false });
  return out.length ? out : [{ text: raw, bold: false, italic: false }];
}

export function downloadSummaryPdf(opts: {
  title: string;
  subject?: string | null;
  markdown: string;
  updatedAt?: string | null;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;
  let page = 1;

  const setFont = (style: "normal" | "bold" | "italic", size: number, color = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const footer = () => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, PAGE_H - 46, PAGE_W - MARGIN, PAGE_H - 46);
    setFont("normal", 8, SOFT);
    doc.text("Fichário 13 · resumo de aula", MARGIN, PAGE_H - 32);
    doc.text(String(page), PAGE_W - MARGIN, PAGE_H - 32, { align: "right" });
  };

  const newPage = () => {
    footer();
    doc.addPage();
    page += 1;
    y = MARGIN;
  };

  const ensure = (h: number) => {
    if (y + h > PAGE_H - 64) newPage();
  };

  /** Escreve linha com segmentos em negrito/itálico, quebrando por palavra. */
  const writeRich = (segs: Segment[], size: number, indent = 0, lead = 1.45) => {
    const maxW = CONTENT_W - indent;
    let x = MARGIN + indent;
    const lineH = size * lead;
    ensure(lineH);
    for (const seg of segs) {
      const style = seg.bold ? "bold" : seg.italic ? "italic" : "normal";
      const words = seg.text.split(/(\s+)/);
      for (const w of words) {
        if (!w) continue;
        setFont(style, size, seg.bold ? INK : SOFT);
        const ww = doc.getTextWidth(w);
        if (x + ww > MARGIN + indent + maxW && w.trim()) {
          y += lineH;
          ensure(lineH);
          x = MARGIN + indent;
        }
        if (x === MARGIN + indent && !w.trim()) continue;
        doc.text(w, x, y);
        x += ww;
      }
    }
    y += lineH;
  };

  // ---- capa / cabeçalho
  doc.setFillColor(...SUN);
  doc.rect(0, 0, PAGE_W, 6, "F");
  y = MARGIN + 14;
  setFont("bold", 9, SUN);
  doc.text("RESUMO DE AULA", MARGIN, y);
  y += 26;
  setFont("bold", 20, INK);
  const titleLines = doc.splitTextToSize(opts.title, CONTENT_W) as string[];
  titleLines.forEach((l) => {
    ensure(26);
    doc.text(l, MARGIN, y);
    y += 24;
  });
  setFont("normal", 9, SOFT);
  const meta = [
    opts.subject ?? null,
    opts.updatedAt ? new Date(opts.updatedAt).toLocaleDateString("pt-BR") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (meta) {
    doc.text(meta, MARGIN, y);
    y += 14;
  }
  doc.setDrawColor(...LINE);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 22;

  // ---- corpo
  const lines = opts.markdown.replace(/\r/g, "").split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      y += 6;
      continue;
    }

    if (line.startsWith("### ")) {
      y += 8;
      ensure(24);
      setFont("bold", 12, INK);
      const t = doc.splitTextToSize(line.slice(4), CONTENT_W) as string[];
      t.forEach((l) => {
        ensure(18);
        doc.text(l, MARGIN, y);
        y += 16;
      });
      y += 4;
      continue;
    }
    if (line.startsWith("## ")) {
      y += 14;
      ensure(34);
      setFont("bold", 15, SUN);
      const t = doc.splitTextToSize(line.slice(3), CONTENT_W) as string[];
      t.forEach((l) => {
        ensure(22);
        doc.text(l, MARGIN, y);
        y += 20;
      });
      doc.setDrawColor(...LINE);
      doc.line(MARGIN, y - 6, PAGE_W - MARGIN, y - 6);
      y += 8;
      continue;
    }
    if (line.startsWith("# ")) {
      y += 12;
      setFont("bold", 17, INK);
      ensure(24);
      doc.text(line.slice(2), MARGIN, y);
      y += 22;
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      ensure(16);
      setFont("normal", 10, SUN);
      doc.text("•", MARGIN + 6, y);
      writeRich(parseInline(bullet[1] ?? ""), 10, 20);
      continue;
    }

    const num = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (num) {
      ensure(16);
      setFont("bold", 10, SUN);
      doc.text(`${num[1]}.`, MARGIN + 2, y);
      writeRich(parseInline(num[2] ?? ""), 10, 22);
      continue;
    }

    writeRich(parseInline(line), 10.5);
    y += 3;
  }

  footer();

  const safe = opts.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  doc.save(`resumo-${safe || "aula"}.pdf`);
}
