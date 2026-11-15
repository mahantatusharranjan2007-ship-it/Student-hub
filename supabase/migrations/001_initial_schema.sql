-- ============================================================================
-- Dharanidhar University Student Hub - Phase 1 Schema Migration
-- Institution: Dharanidhar University, Keonjhar, Odisha, India
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin', 'batch_admin', 'moderator', 'student');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.student_status_enum AS ENUM ('active', 'inactive', 'suspended', 'alumni');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.academic_status_enum AS ENUM ('studying', 'graduated', 'on_leave', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_status_enum AS ENUM ('provisioned_unverified', 'pending_review', 'verified', 'flagged');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.registration_status_enum AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.group_type_enum AS ENUM ('official', 'department', 'course', 'batch', 'study_circle');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status_enum AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- Shared Updated-At Trigger Function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. Departments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  faculty_area TEXT NOT NULL DEFAULT 'General Studies',
  head_name TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT departments_code_upper CHECK (code = UPPER(TRIM(code)) AND LENGTH(TRIM(code)) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_departments_active ON public.departments (is_active, name);

DROP TRIGGER IF EXISTS trg_departments_updated_at ON public.departments;
CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Courses
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  degree_level TEXT NOT NULL DEFAULT 'Undergraduate',
  duration_years SMALLINT NOT NULL DEFAULT 3 CHECK (duration_years BETWEEN 1 AND 6),
  total_semesters SMALLINT NOT NULL DEFAULT 6 CHECK (total_semesters BETWEEN 1 AND 12),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT courses_unique_dept_name UNIQUE (department_id, name),
  CONSTRAINT courses_code_upper CHECK (code = UPPER(TRIM(code)) AND LENGTH(TRIM(code)) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_courses_department ON public.courses (department_id, is_active);

DROP TRIGGER IF EXISTS trg_courses_updated_at ON public.courses;
CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Batches
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  admission_year SMALLINT NOT NULL CHECK (admission_year BETWEEN 1990 AND 2100),
  graduation_year SMALLINT NOT NULL CHECK (graduation_year >= admission_year),
  current_semester SMALLINT NOT NULL DEFAULT 1 CHECK (current_semester BETWEEN 1 AND 12),
  section TEXT NOT NULL DEFAULT 'A',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT batches_unique_cohort UNIQUE (course_id, admission_year, section)
);

CREATE INDEX IF NOT EXISTS idx_batches_course ON public.batches (course_id, admission_year DESC);
CREATE INDEX IF NOT EXISTS idx_batches_department ON public.batches (department_id, is_active);

DROP TRIGGER IF EXISTS trg_batches_updated_at ON public.batches;
CREATE TRIGGER trg_batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Students (Core Academic Identity)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT 'Dharanidhar University',
  campus_location TEXT NOT NULL DEFAULT 'Keonjhar, Odisha, India',
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  semester SMALLINT NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 12),
  roll_number TEXT,
  student_status public.student_status_enum NOT NULL DEFAULT 'active',
  academic_status public.academic_status_enum NOT NULL DEFAULT 'studying',
  verification_status public.verification_status_enum NOT NULL DEFAULT 'pending_review',
  is_initial_provisioned BOOLEAN NOT NULL DEFAULT FALSE,
  profile_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT students_student_id_format CHECK (student_id = UPPER(TRIM(student_id)) AND LENGTH(TRIM(student_id)) >= 4)
);

CREATE INDEX IF NOT EXISTS idx_students_student_id ON public.students (student_id);
CREATE INDEX IF NOT EXISTS idx_students_department ON public.students (department_id, student_status);
CREATE INDEX IF NOT EXISTS idx_students_course ON public.students (course_id);
CREATE INDEX IF NOT EXISTS idx_students_batch ON public.students (batch_id);

DROP TRIGGER IF EXISTS trg_students_updated_at ON public.students;
CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Profiles (User Account & Preferences linked 1:1 to auth.users & students)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  student_record_id UUID NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  personal_email TEXT,
  phone TEXT,
  bio TEXT,
  avatar_url TEXT,
  hometown TEXT,
  academic_interests TEXT[] NOT NULL DEFAULT '{}',
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  password_changed_at TIMESTAMPTZ,
  privacy_show_email BOOLEAN NOT NULL DEFAULT FALSE,
  privacy_show_phone BOOLEAN NOT NULL DEFAULT FALSE,
  privacy_directory_visible BOOLEAN NOT NULL DEFAULT TRUE,
  theme_preference TEXT NOT NULL DEFAULT 'light' CHECK (theme_preference IN ('light', 'dark')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_student_id ON public.profiles (student_id);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Admin Roles (Role Assignments Connected to Existing Student Accounts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_record_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  scope_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  scope_batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT admin_roles_unique_user_role UNIQUE (user_id, role),
  CONSTRAINT admin_roles_valid_admin_role CHECK (role IN ('super_admin', 'batch_admin', 'moderator'))
);

CREATE INDEX IF NOT EXISTS idx_admin_roles_user_active ON public.admin_roles (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_admin_roles_role_active ON public.admin_roles (role, is_active);

-- ----------------------------------------------------------------------------
-- 7. Registration Requests (Public Student Onboarding Queue)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  personal_email TEXT NOT NULL,
  phone TEXT,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  admission_year SMALLINT NOT NULL CHECK (admission_year BETWEEN 1990 AND 2100),
  supporting_note TEXT,
  status public.registration_status_enum NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reg_req_student_id_upper CHECK (student_id = UPPER(TRIM(student_id)) AND LENGTH(TRIM(student_id)) >= 4)
);

-- Prevent duplicate pending or approved requests for the same Student ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_req_unique_active_student_id
  ON public.registration_requests (student_id)
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_reg_req_status_created ON public.registration_requests (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_reg_req_updated_at ON public.registration_requests;
CREATE TRIGGER trg_reg_req_updated_at
  BEFORE UPDATE ON public.registration_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. Registered Devices
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registered_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  user_agent TEXT,
  is_trusted BOOLEAN NOT NULL DEFAULT TRUE,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT registered_devices_unique_user_fp UNIQUE (user_id, device_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_registered_devices_user ON public.registered_devices (user_id, is_revoked);

-- ----------------------------------------------------------------------------
-- 9. Device Sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.registered_devices(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_user_active ON public.device_sessions (user_id, is_active, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_sessions_device ON public.device_sessions (device_id);

-- ----------------------------------------------------------------------------
-- 10. Admin Audit Logs (Append-Only Governance Trail)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_student_id TEXT,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.admin_audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.admin_audit_logs (action);

-- ----------------------------------------------------------------------------
-- 11. Groups & Group Members
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  group_type public.group_type_enum NOT NULL DEFAULT 'department',
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_type_active ON public.groups (group_type, is_active);

DROP TRIGGER IF EXISTS trg_groups_updated_at ON public.groups;
CREATE TRIGGER trg_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('lead', 'moderator', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT group_members_unique UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members (user_id);

-- ----------------------------------------------------------------------------
-- 12. Announcements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'academic', 'examination', 'chemistry', 'security', 'event')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  target_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  target_batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_published ON public.announcements (is_published, is_pinned DESC, published_at DESC);

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 13. Messages (Direct & Group Messaging with Realtime)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (LENGTH(TRIM(content)) > 0 AND LENGTH(content) <= 4000),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_target_xor CHECK (
    (recipient_id IS NOT NULL AND group_id IS NULL) OR
    (recipient_id IS NULL AND group_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_messages_direct ON public.messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages (recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_group ON public.messages (group_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 14. Moderation Reports
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('message', 'profile', 'group', 'other')),
  target_id UUID,
  reason TEXT NOT NULL,
  details TEXT,
  status public.report_status_enum NOT NULL DEFAULT 'open',
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_moderation_reports_status ON public.moderation_reports (status, created_at DESC);

-- ----------------------------------------------------------------------------
-- 15. Security Settings (Singleton Institutional Policy)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  institution_name TEXT NOT NULL DEFAULT 'Dharanidhar University',
  require_admin_approval BOOLEAN NOT NULL DEFAULT TRUE,
  enforce_first_login_password_change BOOLEAN NOT NULL DEFAULT TRUE,
  min_password_length SMALLINT NOT NULL DEFAULT 10 CHECK (min_password_length BETWEEN 8 AND 64),
  max_devices_per_student SMALLINT NOT NULL DEFAULT 5 CHECK (max_devices_per_student BETWEEN 1 AND 20),
  session_timeout_hours SMALLINT NOT NULL DEFAULT 72 CHECK (session_timeout_hours BETWEEN 1 AND 720),
  allow_student_direct_messages BOOLEAN NOT NULL DEFAULT TRUE,
  maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_security_settings_updated_at ON public.security_settings;
CREATE TRIGGER trg_security_settings_updated_at
  BEFORE UPDATE ON public.security_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
