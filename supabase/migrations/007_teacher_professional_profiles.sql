-- ============================================================================
-- Dharanidhar University Student Hub - Migration 007
-- Teacher Professional Profile Fields & Student Read Policy
-- ============================================================================

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS qualification TEXT,
  ADD COLUMN IF NOT EXISTS experience_years INTEGER CHECK (experience_years IS NULL OR (experience_years >= 0 AND experience_years <= 70)),
  ADD COLUMN IF NOT EXISTS subjects_taught TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS research_areas TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS office_location TEXT,
  ADD COLUMN IF NOT EXISTS office_hours TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS publications_summary TEXT,
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;

-- Allow active students & teachers to view active teachers' professional profiles
DROP POLICY IF EXISTS "teachers_read_directory_active" ON public.teachers;
CREATE POLICY "teachers_read_directory_active" ON public.teachers
  FOR SELECT USING (
    is_active = TRUE
    AND (
      public.is_active_student()
      OR public.is_active_teacher()
      OR public.is_any_admin_or_mod()
    )
  );

NOTIFY pgrst, 'reload schema';
