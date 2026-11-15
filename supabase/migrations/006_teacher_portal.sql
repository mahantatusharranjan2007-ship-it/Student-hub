-- ============================================================================
-- Dharanidhar University Student Hub - Migration 006
-- Teacher / Faculty Accounts (Department-Categorized, No Chat Access)
-- & Announcement Links / Promotional Categories
-- ============================================================================

-- 1. Extend app_role enum safely with 'teacher'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'teacher'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'teacher';
  END IF;
END $$;

-- 2. Teachers Table (Separate from Students — No Chat / Group Chat Access)
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  designation TEXT NOT NULL DEFAULT 'Faculty',
  specialization TEXT,
  personal_email TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  password_changed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT teachers_id_format CHECK (teacher_id = UPPER(TRIM(teacher_id)) AND LENGTH(TRIM(teacher_id)) >= 4)
);

CREATE INDEX IF NOT EXISTS idx_teachers_teacher_id ON public.teachers (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teachers_department ON public.teachers (department_id, is_active);

DROP TRIGGER IF EXISTS trg_teachers_updated_at ON public.teachers;
CREATE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Teacher RLS Helper & Guards
CREATE OR REPLACE FUNCTION public.is_active_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.user_id = auth.uid()
      AND t.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_teacher_protected_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_super_admin() OR public.is_batch_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.teacher_id <> OLD.teacher_id
     OR NEW.department_id <> OLD.department_id
     OR NEW.is_active <> OLD.is_active THEN
    RAISE EXCEPTION 'Only administrators may change Teacher ID, department, or active status.';
  END IF;

  IF NEW.must_change_password <> OLD.must_change_password THEN
    RAISE EXCEPTION 'Password change flag must be updated via authenticated password change flow.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_teacher_fields ON public.teachers;
CREATE TRIGGER trg_guard_teacher_fields
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.guard_teacher_protected_fields();

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teachers_read_own_or_admin" ON public.teachers;
CREATE POLICY "teachers_read_own_or_admin" ON public.teachers
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_batch_admin()
  );

DROP POLICY IF EXISTS "teachers_admin_manage" ON public.teachers;
CREATE POLICY "teachers_admin_manage" ON public.teachers
  FOR ALL USING (public.is_super_admin() OR public.is_batch_admin())
  WITH CHECK (public.is_super_admin() OR public.is_batch_admin());

DROP POLICY IF EXISTS "teachers_update_own" ON public.teachers;
CREATE POLICY "teachers_update_own" ON public.teachers
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Allow active teachers to inspect Student profiles (without enabling student chat/groups)
DROP POLICY IF EXISTS "students_read_own_or_directory" ON public.students;
CREATE POLICY "students_read_own_or_directory" ON public.students
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_any_admin_or_mod()
    OR public.is_active_teacher()
    OR (
      public.is_active_student()
      AND student_status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = students.user_id AND p.privacy_directory_visible = TRUE
      )
    )
  );

DROP POLICY IF EXISTS "profiles_read_own_or_directory" ON public.profiles;
CREATE POLICY "profiles_read_own_or_directory" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_any_admin_or_mod()
    OR public.is_active_teacher()
    OR (public.is_active_student() AND privacy_directory_visible = TRUE)
  );

-- 5. Announcements: Support Links, Promotional Posts & Teacher Publishing
ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_category_check;

ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_category_check
  CHECK (category IN ('general', 'academic', 'examination', 'chemistry', 'security', 'event', 'promotion', 'resource'));

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS external_url TEXT,
  ADD COLUMN IF NOT EXISTS link_label TEXT,
  ADD COLUMN IF NOT EXISTS author_name TEXT,
  ADD COLUMN IF NOT EXISTS author_role TEXT NOT NULL DEFAULT 'admin';

DROP POLICY IF EXISTS "announcements_read" ON public.announcements;
CREATE POLICY "announcements_read" ON public.announcements
  FOR SELECT USING (
    (public.is_active_student() OR public.is_active_teacher() OR public.is_any_admin_or_mod())
    AND (is_published = TRUE OR public.is_any_admin_or_mod() OR author_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "announcements_teacher_insert" ON public.announcements;
CREATE POLICY "announcements_teacher_insert" ON public.announcements
  FOR INSERT WITH CHECK (
    public.is_active_teacher()
    AND author_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "announcements_teacher_manage_own" ON public.announcements;
CREATE POLICY "announcements_teacher_manage_own" ON public.announcements
  FOR ALL USING (
    public.is_active_teacher()
    AND author_user_id = auth.uid()
  )
  WITH CHECK (
    public.is_active_teacher()
    AND author_user_id = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
