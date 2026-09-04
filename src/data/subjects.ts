import { mathRaw } from "./lessons";
import { bioRaw, fisicaRaw, quimicaRaw } from "./naturezas";
import { filosofiaRaw, geografiaRaw, historiaRaw, portuguesRaw } from "./humanas";
import type { Lesson, RawLesson, Subject } from "./types";

const monthNames: Record<string, string> = {
  jan: "Janeiro",
  fev: "Fevereiro",
  mar: "Março",
  abr: "Abril",
  mai: "Maio",
  jun: "Junho",
  jul: "Julho",
  ago: "Agosto",
  set: "Setembro",
  out: "Outubro",
  nov: "Novembro",
  dez: "Dezembro",
};

const monthOrder = Object.keys(monthNames);

function build(
  id: string,
  label: string,
  area: string,
  tagline: string,
  raw: RawLesson[],
): Subject {
  const lessons: Lesson[] = raw
    .map(([date, professor, frente, title, url], i) => ({
      id: `${id}-${i}`,
      date,
      month: monthNames[date.split("/")[1] ?? ""] ?? date,
      professor: professor || "Convidado",
      frente,
      title,
      url,
      subject: id,
    }))
    .sort((a, b) => {
      const [da, ma] = a.date.split("/");
      const [db, mb] = b.date.split("/");
      const mi = monthOrder.indexOf(ma ?? "") - monthOrder.indexOf(mb ?? "");
      return mi !== 0 ? mi : Number(da) - Number(db);
    });

  const professors = Array.from(new Set(lessons.map((l) => l.professor)));

  const frenteRank = (p: string) => {
    const nums = lessons
      .filter((l) => l.professor === p)
      .map((l) => Number((l.frente ?? "").match(/\d+/)?.[0]))
      .filter((n) => Number.isFinite(n)) as number[];
    return nums.length ? Math.min(...nums) : Number.POSITIVE_INFINITY;
  };

  professors.sort((a, b) => {
    const ra = frenteRank(a);
    const rb = frenteRank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, "pt-BR");
  });

  return {
    id,
    label,
    area,
    tagline,
    lessons,
    professors,
    months: Array.from(new Set(lessons.map((l) => l.month))),
  };
}

export const areas = ["Matemática", "Naturezas", "Humanas", "Linguagens"] as const;

export const subjects: Subject[] = [
  build(
    "matematica",
    "Matemática",
    "Matemática",
    "Frentes 1, 2 e 3 — funções, geometria e álgebra",
    mathRaw,
  ),
  build(
    "biologia",
    "Biologia",
    "Naturezas",
    "Frentes 1 a 4 — citologia, ecologia e zoologia",
    bioRaw,
  ),
  build(
    "fisica",
    "Física",
    "Naturezas",
    "Frentes 1 a 4 — mecânica, termologia e ondas",
    fisicaRaw,
  ),
  build(
    "quimica",
    "Química",
    "Naturezas",
    "Frentes 1 a 4 — atomística, físico-química e orgânica",
    quimicaRaw,
  ),
  build(
    "portugues",
    "Português",
    "Linguagens",
    "Gramática, Literatura, Interpretação de Texto e Redação",
    portuguesRaw,
  ),
  build(
    "historia",
    "História",
    "Humanas",
    "História Geral e História do Brasil",
    historiaRaw,
  ),
  build(
    "geografia",
    "Geografia",
    "Humanas",
    "Frentes 1 e 2 — geografia física, humana e atualidades",
    geografiaRaw,
  ),
  build(
    "filosofia",
    "Filosofia e Sociologia",
    "Humanas",
    "Pensadores clássicos e sociologia contemporânea",
    filosofiaRaw,
  ),
];

export const allLessons = subjects.flatMap((s) => s.lessons);


export const accentColors = [
  "#e08a3c",
  "#3f7f8c",
  "#c9503f",
  "#6f8f4b",
  "#8a5a86",
  "#5b7f9e",
];

export function professorColor(subject: Subject, professor: string) {
  const i = subject.professors.indexOf(professor);
  return accentColors[(i < 0 ? 0 : i) % accentColors.length]!;
}
