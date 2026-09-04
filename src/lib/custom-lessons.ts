import { supabase } from "@/integrations/supabase/client";
import type { Lesson } from "@/data/types";

const monthAbbr = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
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

/** Converte "2026-03-12" (input date) em "12/mar". */
export function isoToShortDate(iso: string) {
  const [, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  if (!d || !Number.isFinite(mi) || !monthAbbr[mi]) return iso;
  return `${d}/${monthAbbr[mi]}`;
}

export type CustomLessonInput = {
  subject: string;
  date: string;
  professor: string;
  frente: string;
  title: string;
  url: string;
};

export type CustomLesson = Lesson & { custom: true; rowId: string };

function toLesson(row: {
  id: string;
  subject: string;
  date: string;
  professor: string;
  frente: string;
  title: string;
  url: string;
}): CustomLesson {
  const abbr = row.date.split("/")[1] ?? "";
  return {
    id: `custom-${row.id}`,
    rowId: row.id,
    custom: true,
    date: row.date,
    month: monthNames[abbr] ?? row.date,
    professor: row.professor || "Convidado",
    frente: row.frente || "extra",
    title: row.title,
    url: row.url,
    subject: row.subject,
  };
}

export async function fetchCustomLessons(): Promise<CustomLesson[]> {
  const { data, error } = await supabase
    .from("custom_lessons")
    .select("id,subject,date,professor,frente,title,url")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toLesson);
}

export async function addCustomLesson(input: CustomLessonInput) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sem sessão");
  const { error } = await supabase.from("custom_lessons").insert({
    user_id: auth.user.id,
    subject: input.subject,
    date: input.date,
    professor: input.professor,
    frente: input.frente,
    title: input.title,
    url: input.url,
  });
  if (error) throw error;
}

export async function deleteCustomLesson(rowId: string) {
  const { error } = await supabase.from("custom_lessons").delete().eq("id", rowId);
  if (error) throw error;
}
