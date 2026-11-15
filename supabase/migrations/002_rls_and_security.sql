-- ============================================================================
-- Dharanidhar University Student Hub - RLS Policies, Triggers & Realtime
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Security Definer Role Helpers (Bypass RLS safely to avoid recursion)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_active_role(check_role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_roles ar
    JOIN public.students s ON s.user_id = ar.user_id
    WHERE ar.user_id = auth.uid()
      AND ar.role = check_role
      AND ar.is_active = TRUE
      AND ar.revoked_at IS NULL
      AND s.student_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_active_role('super_admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_batch_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_active_role('batch_admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_active_role('moderator'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_any_admin_or_mod()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR public.is_batch_admin() OR public.is_moderator();
$$;

CREATE OR REPLACE FUNCTION public.is_active_student()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.user_id = auth.uid()
      AND s.student_status = 'active'
  );
$$;

-- ----------------------------------------------------------------------------
-- Privilege Escalation Guard Triggers
-- ----------------------------------------------------------------------------
-- 1. Prevent non-super-admins from inserting or modifying admin_roles
CREATE OR REPLACE FUNCTION public.guard_admin_roles_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role (initial server provisioning or server-side admin endpoint)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an active Super Admin may manage administrator privileges.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_admin_roles ON public.admin_roles;
CREATE TRIGGER trg_guard_admin_roles
  BEFORE INSERT OR UPDATE OR DELETE ON public.admin_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_roles_mutation();

-- 2. Prevent students from self-modifying protected profile fields directly via client SDK
CREATE OR REPLACE FUNCTION public.guard_profile_protected_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.student_id <> OLD.student_id OR NEW.student_record_id <> OLD.student_record_id THEN
    RAISE EXCEPTION 'Cannot modify immutable student identifier.';
  END IF;

  -- must_change_password can only be cleared via verified server change-password route
  IF NEW.must_change_password <> OLD.must_change_password THEN
    RAISE EXCEPTION 'Password change flag must be updated via authenticated password change flow.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_fields ON public.profiles;
CREATE TRIGGER trg_guard_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_protected_fields();

-- ----------------------------------------------------------------------------
-- Enable Row Level Security on All Tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registered_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Policies: Departments, Courses, Batches
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "departments_public_read" ON public.departments;
CREATE POLICY "departments_public_read" ON public.departments
  FOR SELECT USING (is_active = TRUE OR public.is_any_admin_or_mod());

DROP POLICY IF EXISTS "departments_super_admin_write" ON public.departments;
CREATE POLICY "departments_super_admin_write" ON public.departments
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "courses_public_read" ON public.courses;
CREATE POLICY "courses_public_read" ON public.courses
  FOR SELECT USING (is_active = TRUE OR public.is_any_admin_or_mod());

DROP POLICY IF EXISTS "courses_super_admin_write" ON public.courses;
CREATE POLICY "courses_super_admin_write" ON public.courses
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "batches_public_read" ON public.batches;
CREATE POLICY "batches_public_read" ON public.batches
  FOR SELECT USING (is_active = TRUE OR public.is_any_admin_or_mod());

DROP POLICY IF EXISTS "batches_admin_write" ON public.batches;
CREATE POLICY "batches_admin_write" ON public.batches
  FOR ALL USING (public.is_super_admin() OR public.is_batch_admin())
  WITH CHECK (public.is_super_admin() OR public.is_batch_admin());

-- ----------------------------------------------------------------------------
-- Policies: Students & Profiles
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "students_read_own_or_directory" ON public.students;
CREATE POLICY "students_read_own_or_directory" ON public.students
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_any_admin_or_mod()
    OR (
      public.is_active_student()
      AND student_status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = students.user_id AND p.privacy_directory_visible = TRUE
      )
    )
  );

DROP POLICY IF EXISTS "students_admin_manage" ON public.students;
CREATE POLICY "students_admin_manage" ON public.students
  FOR ALL USING (public.is_super_admin() OR public.is_batch_admin())
  WITH CHECK (public.is_super_admin() OR public.is_batch_admin());

DROP POLICY IF EXISTS "profiles_read_own_or_directory" ON public.profiles;
CREATE POLICY "profiles_read_own_or_directory" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_any_admin_or_mod()
    OR (public.is_active_student() AND privacy_directory_visible = TRUE)
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid() OR public.is_super_admin())
  WITH CHECK (id = auth.uid() OR public.is_super_admin());

-- ----------------------------------------------------------------------------
-- Policies: Admin Roles (Super Admin Governance Only)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_roles_select" ON public.admin_roles;
CREATE POLICY "admin_roles_select" ON public.admin_roles
  FOR SELECT USING (user_id = auth.uid() OR public.is_any_admin_or_mod());

DROP POLICY IF EXISTS "admin_roles_super_admin_only" ON public.admin_roles;
CREATE POLICY "admin_roles_super_admin_only" ON public.admin_roles
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- Policies: Registration Requests
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "reg_req_public_insert_pending_only" ON public.registration_requests;
CREATE POLICY "reg_req_public_insert_pending_only" ON public.registration_requests
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND created_user_id IS NULL
  );

DROP POLICY IF EXISTS "reg_req_admin_read" ON public.registration_requests;
CREATE POLICY "reg_req_admin_read" ON public.registration_requests
  FOR SELECT USING (public.is_super_admin() OR public.is_batch_admin());

DROP POLICY IF EXISTS "reg_req_admin_update" ON public.registration_requests;
CREATE POLICY "reg_req_admin_update" ON public.registration_requests
  FOR UPDATE USING (public.is_super_admin() OR public.is_batch_admin())
  WITH CHECK (public.is_super_admin() OR public.is_batch_admin());

-- ----------------------------------------------------------------------------
-- Policies: Registered Devices & Device Sessions
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "devices_own_or_super_admin" ON public.registered_devices;
CREATE POLICY "devices_own_or_super_admin" ON public.registered_devices
  FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "devices_own_update" ON public.registered_devices;
CREATE POLICY "devices_own_update" ON public.registered_devices
  FOR UPDATE USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "sessions_own_or_super_admin" ON public.device_sessions;
CREATE POLICY "sessions_own_or_super_admin" ON public.device_sessions
  FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "sessions_revoke_own_or_super_admin" ON public.device_sessions;
CREATE POLICY "sessions_revoke_own_or_super_admin" ON public.device_sessions
  FOR UPDATE USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- ----------------------------------------------------------------------------
-- Policies: Admin Audit Logs (Immutable Append-Only)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.admin_audit_logs;
CREATE POLICY "audit_logs_admin_read" ON public.admin_audit_logs
  FOR SELECT USING (public.is_any_admin_or_mod());

DROP POLICY IF EXISTS "audit_logs_admin_insert" ON public.admin_audit_logs;
CREATE POLICY "audit_logs_admin_insert" ON public.admin_audit_logs
  FOR INSERT WITH CHECK (public.is_any_admin_or_mod());

-- Intentionally NO UPDATE or DELETE policy on admin_audit_logs.

-- ----------------------------------------------------------------------------
-- Policies: Groups & Group Members
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "groups_student_read" ON public.groups;
CREATE POLICY "groups_student_read" ON public.groups
  FOR SELECT USING (public.is_active_student() AND (is_active = TRUE OR public.is_any_admin_or_mod()));

DROP POLICY IF EXISTS "groups_admin_manage" ON public.groups;
CREATE POLICY "groups_admin_manage" ON public.groups
  FOR ALL USING (public.is_super_admin() OR public.is_batch_admin())
  WITH CHECK (public.is_super_admin() OR public.is_batch_admin());

DROP POLICY IF EXISTS "group_members_read" ON public.group_members;
CREATE POLICY "group_members_read" ON public.group_members
  FOR SELECT USING (public.is_active_student());

DROP POLICY IF EXISTS "group_members_join_leave_own" ON public.group_members;
CREATE POLICY "group_members_join_leave_own" ON public.group_members
  FOR INSERT WITH CHECK (user_id = auth.uid() AND public.is_active_student());

DROP POLICY IF EXISTS "group_members_delete_own_or_admin" ON public.group_members;
CREATE POLICY "group_members_delete_own_or_admin" ON public.group_members
  FOR DELETE USING (user_id = auth.uid() OR public.is_super_admin() OR public.is_batch_admin());

-- ----------------------------------------------------------------------------
-- Policies: Announcements
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "announcements_read" ON public.announcements;
CREATE POLICY "announcements_read" ON public.announcements
  FOR SELECT USING (
    public.is_active_student() AND (is_published = TRUE OR public.is_any_admin_or_mod())
  );

DROP POLICY IF EXISTS "announcements_admin_write" ON public.announcements;
CREATE POLICY "announcements_admin_write" ON public.announcements
  FOR ALL USING (public.is_super_admin() OR public.is_batch_admin() OR public.is_moderator())
  WITH CHECK (public.is_super_admin() OR public.is_batch_admin() OR public.is_moderator());

-- ----------------------------------------------------------------------------
-- Policies: Messages (Direct + Group)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "messages_read_participating" ON public.messages;
CREATE POLICY "messages_read_participating" ON public.messages
  FOR SELECT USING (
    deleted_at IS NULL AND (
      sender_id = auth.uid()
      OR recipient_id = auth.uid()
      OR (
        group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = messages.group_id AND gm.user_id = auth.uid()
        )
      )
      OR public.is_super_admin()
      OR public.is_moderator()
    )
  );

DROP POLICY IF EXISTS "messages_insert_active_student" ON public.messages;
CREATE POLICY "messages_insert_active_student" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND public.is_active_student()
    AND (
      group_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = messages.group_id AND gm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "messages_update_read_or_moderate" ON public.messages;
CREATE POLICY "messages_update_read_or_moderate" ON public.messages
  FOR UPDATE USING (
    recipient_id = auth.uid()
    OR sender_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_moderator()
  );

-- ----------------------------------------------------------------------------
-- Policies: Moderation Reports
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "reports_insert_student" ON public.moderation_reports;
CREATE POLICY "reports_insert_student" ON public.moderation_reports
  FOR INSERT WITH CHECK (reporter_user_id = auth.uid() AND public.is_active_student());

DROP POLICY IF EXISTS "reports_read_own_or_mod" ON public.moderation_reports;
CREATE POLICY "reports_read_own_or_mod" ON public.moderation_reports
  FOR SELECT USING (reporter_user_id = auth.uid() OR public.is_any_admin_or_mod());

DROP POLICY IF EXISTS "reports_update_mod" ON public.moderation_reports;
CREATE POLICY "reports_update_mod" ON public.moderation_reports
  FOR UPDATE USING (public.is_any_admin_or_mod())
  WITH CHECK (public.is_any_admin_or_mod());

-- ----------------------------------------------------------------------------
-- Policies: Security Settings
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "security_settings_read_auth" ON public.security_settings;
CREATE POLICY "security_settings_read_auth" ON public.security_settings
  FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));

DROP POLICY IF EXISTS "security_settings_super_admin_write" ON public.security_settings;
CREATE POLICY "security_settings_super_admin_write" ON public.security_settings
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- Storage Bucket & RLS for Student Avatars
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_user_upload_own" ON storage.objects;
CREATE POLICY "avatars_user_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_user_update_own" ON storage.objects;
CREATE POLICY "avatars_user_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- Supabase Realtime Publication
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.registration_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
