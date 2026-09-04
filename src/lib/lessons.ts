import { supabase } from "@/integrations/supabase/client";

/** Ids das aulas marcadas como revisadas pelo usuário logado. */
export async function fetchWatchedLessons() {
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("lesson_id,watched")
    .eq("watched", true);
  if (error) throw error;
  return (data ?? []).map((r) => r.lesson_id as string);
}

export async function setLessonWatched(lessonId: string, watched: boolean) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sem sessão");
  const { error } = await supabase
    .from("lesson_progress")
    .upsert(
      { user_id: auth.user.id, lesson_id: lessonId, watched, updated_at: new Date().toISOString() },
      { onConflict: "user_id,lesson_id" },
    );
  if (error) throw error;
}

export function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
