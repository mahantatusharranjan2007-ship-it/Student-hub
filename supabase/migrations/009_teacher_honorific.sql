-- ============================================================================
-- Dharanidhar University Student Hub - Migration 009
-- Adds optional prefix / honorific column (Dr., Prof., Mr., Ms., etc.) to teachers
-- ============================================================================

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS honorific TEXT;

NOTIFY pgrst, 'reload schema';
