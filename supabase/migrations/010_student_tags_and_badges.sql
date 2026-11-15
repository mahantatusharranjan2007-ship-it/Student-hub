-- ============================================================================
-- Dharanidhar University Student Hub - Migration 010
-- Customizable Student Tags (e.g. President, CR, Club Lead) Assigned by Super Admin
-- ============================================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS custom_tag TEXT,
  ADD COLUMN IF NOT EXISTS tag_color TEXT;

CREATE INDEX IF NOT EXISTS idx_students_custom_tag
  ON public.students (custom_tag)
  WHERE custom_tag IS NOT NULL;

NOTIFY pgrst, 'reload schema';
