import { supabase } from "@/integrations/supabase/client";

export type Subject = {
  id: string;
  name: string;
  color: string;
  area: string;
  description: string | null;
  position: number;
  parent_id: string | null;
};

/** Frentes (subpastas) padrão de cada matéria, pelo nome da matéria. */
export const FRENTES: Record<string, string[]> = {
  "Biologia": ["Frente 1", "Frente 2", "Frente 3", "Frente 4"],
  "Química": ["Frente 1", "Frente 2", "Frente 3", "Frente 4"],
  "Física": ["Frente 1", "Frente 2", "Frente 3", "Frente 4"],
  "Matemática": ["Frente 1", "Frente 2", "Frente 3"],
  "Geografia": ["Frente 1", "Frente 2", "Frente Atualidades"],
  "História": ["Frente HB", "Frente HG"],
  "Português": [
    "Frente Redação",
    "Frente Literatura",
    "Frente Gramática",
    "Frente Interpretação de Texto",
  ],
  "Filosofia e Sociologia": ["Filosofia", "Sociologia"],
};

/** Nome completo da subpasta, ex.: "Biologia (Frente 1)". */
export function frenteName(parentName: string, frente: string) {
  if (parentName === "Filosofia e Sociologia") return frente;
  return `${parentName} (${frente})`;
}

/** Matérias de topo (sem matéria-mãe). */
export function topLevelSubjects(subjects: Subject[]) {
  return subjects.filter((s) => !s.parent_id);
}

/** Subpastas de uma matéria. */
export function childrenOf(subjects: Subject[], id: string) {
  return subjects.filter((s) => s.parent_id === id);
}

/** Ids que contam para uma matéria: ela mesma e suas subpastas. */
export function scopeIds(subjects: Subject[], id: string) {
  return [id, ...childrenOf(subjects, id).map((s) => s.id)];
}

/** Matérias de topo já com suas frentes, na ordem de exibição. */
export function subjectTree(subjects: Subject[]) {
  return topLevelSubjects(subjects).map((subject) => ({
    subject,
    children: childrenOf(subjects, subject.id),
  }));
}



export type Material = {
  id: string;
  subject_id: string;
  lesson_id: string | null;
  lesson_ids: string[] | null;
  title: string;
  file_path: string | null;
  file_size: number | null;
  kind: string;
  link_url: string | null;
  read: boolean;
  topic: string | null;
  course: string | null;
  tags: string[] | null;
  external_id: string | null;
  source: string | null;
  created_at: string;
};

/** Aulas ligadas a um material (aceita o formato antigo de uma única aula). */
export function materialLessonIds(m: {
  lesson_id?: string | null;
  lesson_ids?: string[] | null;
}): string[] {
  if (m.lesson_ids && m.lesson_ids.length > 0) return m.lesson_ids;
  return m.lesson_id ? [m.lesson_id] : [];
}

export type Flashcard = {
  id: string;
  subject_id: string;
  lesson_id: string | null;
  front: string;
  back: string;
  box: number;
  reviews: number;
  next_review: string;
};

export type QuizQuestion = {
  id: string;
  subject_id: string;
  lesson_id: string | null;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
};

export type StudySession = {
  id: string;
  subject_id: string | null;
  day: string;
  minutes: number;
  cards_reviewed: number;
  correct: number;
  total: number;
};

export const today = () => new Date().toISOString().slice(0, 10);

export function formatSize(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function relativeDate(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  if (days < 30) return `há ${Math.floor(days / 7)} semana${days < 14 ? "" : "s"}`;
  return `há ${Math.floor(days / 30)} mês(es)`;
}

/** Qualidade da resposta numa revisão. */
export type Quality = "dificil" | "bom" | "facil";

/** Intervalo de Leitner por caixa, em dias (caixa 1 = revisar hoje mesmo). */
const BOX_DAYS = [0, 0, 1, 3, 7, 15, 30, 60];
export const MAX_BOX = BOX_DAYS.length - 1;

/** Minutos de espera para um cartão marcado como difícil (reaprendizagem). */
export const RELEARN_MINUTES = 10;

/** Um cartão está vencido quando a data de revisão já passou. */
export function isDue(card: { next_review: string }, at: number = Date.now()) {
  const t = new Date(card.next_review).getTime();
  return Number.isNaN(t) ? true : t <= at;
}

/** Nova caixa a partir da caixa atual e da qualidade da resposta. */
export function nextBox(box: number, quality: Quality) {
  if (quality === "dificil") return 1;
  const step = quality === "facil" ? 2 : 1;
  return Math.min(MAX_BOX, Math.max(1, box) + step);
}

/** Data/hora ISO da próxima revisão. */
export function nextReviewDate(box: number, quality: Quality = "bom") {
  const d = new Date();
  if (quality === "dificil") {
    d.setMinutes(d.getMinutes() + RELEARN_MINUTES);
    return d.toISOString();
  }
  const days = BOX_DAYS[Math.min(box, MAX_BOX)] ?? 1;
  if (days === 0) {
    d.setHours(d.getHours() + 4);
    return d.toISOString();
  }
  // vence na virada do dia alvo, no fuso local
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Texto curto do intervalo agendado, para feedback imediato. */
export function scheduleLabel(quality: Quality, box: number) {
  if (quality === "dificil") return `de novo em ~${RELEARN_MINUTES} min`;
  const days = BOX_DAYS[Math.min(box, MAX_BOX)] ?? 1;
  if (days === 0) return "mais tarde hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}


export async function fetchSubjects() {
  const { data, error } = await supabase
    .from("subjects")
    .select("id,name,color,area,description,position,parent_id")
    .order("position");
  if (error) throw error;
  return (data ?? []) as Subject[];
}

export async function fetchMaterials(subjectId?: string) {
  let q = supabase.from("materials").select("*").order("created_at", { ascending: false });
  if (subjectId) q = q.eq("subject_id", subjectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Material[];
}

/** Salva um arquivo do OneDrive como material da matéria escolhida. */
export async function saveCloudMaterial(entry: {
  subject_id: string;
  lesson_id?: string | null;
  lesson_ids?: string[];
  title: string;
  external_id: string;
  file_size?: number;
  topic?: string | null;
  tags?: string[];
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Faça login para salvar materiais.");

  const existing = await supabase
    .from("materials")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("subject_id", entry.subject_id)
    .eq("external_id", entry.external_id)
    .maybeSingle();
  if (existing.data) return "exists" as const;

  const ext = entry.title.split(".").pop()?.toUpperCase() ?? "";
  const { error } = await supabase.from("materials").insert({
    user_id: auth.user.id,
    subject_id: entry.subject_id,
    title: entry.title,
    kind: ["PDF", "DOCX", "PPTX", "XLSX"].includes(ext) ? ext : "ARQUIVO",
    external_id: entry.external_id,
    lesson_id: entry.lesson_ids?.[0] ?? entry.lesson_id ?? null,
    lesson_ids: entry.lesson_ids ?? (entry.lesson_id ? [entry.lesson_id] : []),
    source: "onedrive",
    file_size: entry.file_size ?? 0,
    topic: entry.topic ?? null,
    tags: entry.tags ?? [],
  });
  if (error) throw error;
  return "created" as const;
}

export async function fetchFlashcards(subjectId?: string) {
  let q = supabase.from("flashcards").select("*").order("next_review");
  if (subjectId) q = q.eq("subject_id", subjectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Flashcard[];
}

export async function fetchQuestions(subjectId?: string) {
  let q = supabase.from("quiz_questions").select("*").order("created_at");
  if (subjectId) q = q.eq("subject_id", subjectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
  })) as QuizQuestion[];
}

export async function fetchSessions() {
  const { data, error } = await supabase
    .from("study_sessions")
    .select("*")
    .order("day", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as StudySession[];
}

/** Dias consecutivos de estudo, contando a partir de hoje ou ontem. */
export function computeStreak(sessions: StudySession[]) {
  const days = new Set(sessions.map((s) => s.day));
  if (days.size === 0) return 0;
  const cursor = new Date();
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(cursor.toISOString().slice(0, 10))) return 0;
  }
  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function logSession(entry: {
  subject_id?: string | null;
  minutes?: number;
  cards_reviewed?: number;
  correct?: number;
  total?: number;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("study_sessions").insert({
    user_id: auth.user.id,
    subject_id: entry.subject_id ?? null,
    minutes: entry.minutes ?? 0,
    cards_reviewed: entry.cards_reviewed ?? 0,
    correct: entry.correct ?? 0,
    total: entry.total ?? 0,
  });
}

const DEFAULT_SUBJECTS: Omit<Subject, "id" | "description" | "parent_id">[] = [
  { name: "Matemática", color: "#e08a3c", area: "Matemática", position: 1 },
  { name: "Física", color: "#3f7f8c", area: "Naturezas", position: 2 },
  { name: "Química", color: "#c9503f", area: "Naturezas", position: 3 },
  { name: "Biologia", color: "#6f8f4b", area: "Naturezas", position: 4 },

  { name: "Geografia", color: "#b5883f", area: "Humanas", position: 5 },
  { name: "História", color: "#8a5a86", area: "Humanas", position: 6 },
  { name: "Filosofia e Sociologia", color: "#7a6ea8", area: "Humanas", position: 7 },
  { name: "Português", color: "#4d7a5c", area: "Linguagens", position: 9 },
  { name: "Inglês", color: "#a8683f", area: "Linguagens", position: 10 },
];


/** Guarda contra execuções simultâneas do setup (evita matérias duplicadas). */
let setupInflight: Promise<"created" | "ok" | false> | null = null;

/** Garante perfil e matérias padrão para o usuário logado. */
export function ensureUserSetup() {
  if (!setupInflight) {
    setupInflight = runUserSetup().finally(() => {
      setupInflight = null;
    });
  }
  return setupInflight;
}

async function runUserSetup() {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    await supabase.from("profiles").insert({
      id: user.id,
      display_name:
        (user.user_metadata?.["display_name"] as string | undefined) ??
        user.email?.split("@")[0] ??
        "Estudante",
    });
  }

  const { count } = await supabase
    .from("subjects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!count) {
    await supabase
      .from("subjects")
      .insert(DEFAULT_SUBJECTS.map((s) => ({ ...s, user_id: user.id })));
    await ensureFrentes(user.id);
    return "created" as const;
  }
  const added = await ensureFrentes(user.id);
  return added ? ("created" as const) : ("ok" as const);
}

/**
 * Agrupa "Filosofia" e "Sociologia" soltas sob a matéria "Filosofia e Sociologia".
 * Necessário para contas criadas antes da divisão por frentes.
 */
async function ensureFilosofiaGroup(userId: string) {
  const { data } = await supabase
    .from("subjects")
    .select("id,name,color,area,position,parent_id")
    .eq("user_id", userId);
  const rows = data ?? [];
  const loose = rows.filter(
    (s) => !s.parent_id && (s.name === "Filosofia" || s.name === "Sociologia"),
  );
  if (loose.length === 0) return 0;

  let group = rows.find((s) => !s.parent_id && s.name === "Filosofia e Sociologia");
  if (!group) {
    const { data: created } = await supabase
      .from("subjects")
      .insert({
        user_id: userId,
        name: "Filosofia e Sociologia",
        color: loose[0]!.color,
        area: "Humanas",
        position: 7,
      })
      .select("id,name,color,area,position,parent_id")
      .single();
    if (!created) return 0;
    group = created;
  }
  await supabase
    .from("subjects")
    .update({ parent_id: group.id, position: group.position * 100 })
    .in(
      "id",
      loose.map((s) => s.id),
    );
  return loose.length;
}

/** Cria as subpastas (frentes) faltantes de cada matéria do usuário. */
export async function ensureFrentes(userId: string) {
  const grouped = await ensureFilosofiaGroup(userId);

  const { data } = await supabase
    .from("subjects")
    .select("id,name,color,area,position,parent_id")
    .eq("user_id", userId);
  const rows = data ?? [];
  const parents = rows.filter((s) => !s.parent_id);


  const toInsert: Record<string, unknown>[] = [];
  for (const parent of parents) {
    const frentes = FRENTES[parent.name];
    if (!frentes) continue;
    const existing = new Set(
      rows.filter((s) => s.parent_id === parent.id).map((s) => s.name),
    );
    frentes.forEach((frente, i) => {
      const name = frenteName(parent.name, frente);
      if (existing.has(name)) return;
      toInsert.push({
        user_id: userId,
        parent_id: parent.id,
        name,
        color: parent.color,
        area: parent.area,
        position: parent.position * 100 + i + 1,
      });
    });
  }
  if (toInsert.length === 0) return grouped;
  await supabase.from("subjects").insert(toInsert as never);
  return toInsert.length + grouped;

}
