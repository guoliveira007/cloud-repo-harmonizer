/** Bancas conhecidas e a referência de questões por área de cada prova. */
export type BoardRef = {
  id: string;
  name: string;
  reference: string;
  areas: { area: string; questions: number }[];
};

export const BOARDS: BoardRef[] = [
  {
    id: "enem",
    name: "ENEM",
    reference: "180 questões em 2 dias + redação",
    areas: [
      { area: "Linguagens", questions: 45 },
      { area: "Humanas", questions: 45 },
      { area: "Naturezas", questions: 45 },
      { area: "Matemática", questions: 45 },
    ],
  },
  {
    id: "fuvest",
    name: "FUVEST",
    reference: "1ª fase: 90 questões interdisciplinares",
    areas: [
      { area: "Linguagens", questions: 25 },
      { area: "Humanas", questions: 25 },
      { area: "Naturezas", questions: 20 },
      { area: "Matemática", questions: 20 },
    ],
  },
  {
    id: "unicamp",
    name: "UNICAMP",
    reference: "1ª fase: 72 questões + redação",
    areas: [
      { area: "Linguagens", questions: 20 },
      { area: "Humanas", questions: 20 },
      { area: "Naturezas", questions: 16 },
      { area: "Matemática", questions: 16 },
    ],
  },
  {
    id: "unifesp",
    name: "UNIFESP",
    reference: "1ª fase: 90 questões interdisciplinares",
    areas: [
      { area: "Linguagens", questions: 25 },
      { area: "Humanas", questions: 25 },
      { area: "Naturezas", questions: 20 },
      { area: "Matemática", questions: 20 },
    ],
  },
  {
    id: "uerj",
    name: "UERJ",
    reference: "Exame de qualificação: 60 questões",
    areas: [
      { area: "Linguagens", questions: 20 },
      { area: "Humanas", questions: 15 },
      { area: "Naturezas", questions: 13 },
      { area: "Matemática", questions: 12 },
    ],
  },
  {
    id: "fatec",
    name: "FATEC",
    reference: "54 questões interdisciplinares",
    areas: [
      { area: "Linguagens", questions: 15 },
      { area: "Humanas", questions: 13 },
      { area: "Naturezas", questions: 13 },
      { area: "Matemática", questions: 13 },
    ],
  },
];

export function boardById(id: string): BoardRef | undefined {
  return BOARDS.find((b) => b.id === id);
}
