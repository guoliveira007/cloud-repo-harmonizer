ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'imported',
  ADD COLUMN IF NOT EXISTS generation_sources jsonb;

CREATE INDEX IF NOT EXISTS exam_questions_source_type_idx ON public.exam_questions (user_id, source_type);