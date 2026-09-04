ALTER TABLE public.custom_lessons
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id);

ALTER TABLE public.lesson_summaries
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id);

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

ALTER TABLE public.error_reviews DROP CONSTRAINT IF EXISTS error_reviews_user_id_question_id_key;
ALTER TABLE public.error_reviews ADD CONSTRAINT error_reviews_question_id_key UNIQUE (question_id);

CREATE POLICY "own resolucoes select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resolucoes' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "own resolucoes insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resolucoes' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "own resolucoes update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'resolucoes' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "own resolucoes delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resolucoes' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "own materiais all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'materiais' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'materiais' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "own exam files all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'exam-files' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'exam-files' AND (auth.uid())::text = (storage.foldername(name))[1]);