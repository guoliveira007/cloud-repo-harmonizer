CREATE TABLE public.custom_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL,
  date text NOT NULL,
  professor text NOT NULL DEFAULT '',
  frente text NOT NULL DEFAULT '',
  title text NOT NULL,
  url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_lessons TO authenticated;
GRANT ALL ON public.custom_lessons TO service_role;
ALTER TABLE public.custom_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own custom lessons" ON public.custom_lessons FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX custom_lessons_user_subject_idx ON public.custom_lessons (user_id, subject);