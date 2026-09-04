ALTER TABLE public.custom_lessons
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id);

ALTER TABLE public.lesson_summaries
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id);

UPDATE public.custom_lessons cl
SET subject_id = s.id
FROM public.subjects s
WHERE s.user_id = cl.user_id
  AND lower(trim(s.name)) = lower(trim(cl.subject))
  AND cl.subject_id IS NULL;

UPDATE public.lesson_summaries ls
SET subject_id = s.id
FROM public.subjects s
WHERE s.user_id = ls.user_id
  AND ls.subject IS NOT NULL
  AND lower(trim(s.name)) = lower(trim(ls.subject))
  AND ls.subject_id IS NULL;

CREATE INDEX IF NOT EXISTS custom_lessons_subject_id_idx ON public.custom_lessons (subject_id);
CREATE INDEX IF NOT EXISTS lesson_summaries_subject_id_idx ON public.lesson_summaries (subject_id);

CREATE TABLE public.upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exam_question_id uuid REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  photo_path text,
  transcript text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_sessions TO authenticated;
GRANT ALL ON public.upload_sessions TO service_role;

ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own upload sessions" ON public.upload_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX upload_sessions_user_idx ON public.upload_sessions (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_upload_sessions_updated_at
  BEFORE UPDATE ON public.upload_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.upload_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.upload_sessions;