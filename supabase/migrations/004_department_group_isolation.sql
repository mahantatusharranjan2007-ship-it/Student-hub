-- ============================================================================
-- Dharanidhar University Student Hub - Department/Course/Batch Group Isolation
-- Ensures students can ONLY view, join, and message groups matching their
-- assigned department (or university-wide groups where department_id IS NULL),
-- course, and batch.
-- ============================================================================

-- 1. Eligibility Helper (checks active student matches group scope)
CREATE OR REPLACE FUNCTION public.is_eligible_for_group(target_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups g
    JOIN public.students s ON s.user_id = auth.uid()
    WHERE g.id = target_group_id
      AND g.is_active = TRUE
      AND s.student_status = 'active'
      AND (g.department_id IS NULL OR g.department_id = s.department_id)
      AND (g.course_id IS NULL OR g.course_id = s.course_id)
      AND (g.batch_id IS NULL OR g.batch_id = s.batch_id)
  );
$$;

-- 2. Trigger Guard: Prevent inserting/updating group_members for an ineligible student
CREATE OR REPLACE FUNCTION public.guard_group_member_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eligible BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.groups g
    JOIN public.students s ON s.user_id = NEW.user_id
    WHERE g.id = NEW.group_id
      AND g.is_active = TRUE
      AND s.student_status = 'active'
      AND (g.department_id IS NULL OR g.department_id = s.department_id)
      AND (g.course_id IS NULL OR g.course_id = s.course_id)
      AND (g.batch_id IS NULL OR g.batch_id = s.batch_id)
  )
  INTO v_eligible;

  IF NOT COALESCE(v_eligible, FALSE) THEN
    RAISE EXCEPTION 'Access denied: students may only join groups belonging to their own department, course, or batch.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_group_member_eligibility ON public.group_members;
CREATE TRIGGER trg_guard_group_member_eligibility
  BEFORE INSERT OR UPDATE OF group_id, user_id ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_member_eligibility();

-- 3. Trigger: Automatically remove mismatched group memberships if a student's department/course/batch changes
CREATE OR REPLACE FUNCTION public.cleanup_group_members_on_student_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.group_members gm
  USING public.groups g
  WHERE gm.group_id = g.id
    AND gm.user_id = NEW.user_id
    AND (
      (g.department_id IS NOT NULL AND g.department_id <> NEW.department_id)
      OR (g.course_id IS NOT NULL AND g.course_id <> NEW.course_id)
      OR (g.batch_id IS NOT NULL AND (NEW.batch_id IS NULL OR g.batch_id <> NEW.batch_id))
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_group_members_on_student_transfer ON public.students;
CREATE TRIGGER trg_cleanup_group_members_on_student_transfer
  AFTER UPDATE OF department_id, course_id, batch_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_group_members_on_student_transfer();

-- 4. One-time cleanup of any existing cross-department / mismatched group memberships
DELETE FROM public.group_members gm
USING public.groups g, public.students s
WHERE gm.group_id = g.id
  AND gm.user_id = s.user_id
  AND (
    (g.department_id IS NOT NULL AND g.department_id <> s.department_id)
    OR (g.course_id IS NOT NULL AND g.course_id <> s.course_id)
    OR (g.batch_id IS NOT NULL AND (s.batch_id IS NULL OR g.batch_id <> s.batch_id))
  );

-- 5. Tighten RLS Policies on groups, group_members, and messages
DROP POLICY IF EXISTS "groups_student_read" ON public.groups;
CREATE POLICY "groups_student_read" ON public.groups
  FOR SELECT USING (
    public.is_eligible_for_group(id)
    OR public.is_any_admin_or_mod()
  );

DROP POLICY IF EXISTS "group_members_read" ON public.group_members;
CREATE POLICY "group_members_read" ON public.group_members
  FOR SELECT USING (
    public.is_eligible_for_group(group_id)
    OR public.is_any_admin_or_mod()
  );

DROP POLICY IF EXISTS "group_members_join_leave_own" ON public.group_members;
CREATE POLICY "group_members_join_leave_own" ON public.group_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND public.is_eligible_for_group(group_id)
  );

DROP POLICY IF EXISTS "messages_read_participating" ON public.messages;
CREATE POLICY "messages_read_participating" ON public.messages
  FOR SELECT USING (
    deleted_at IS NULL AND (
      sender_id = auth.uid()
      OR recipient_id = auth.uid()
      OR (
        group_id IS NOT NULL
        AND public.is_eligible_for_group(messages.group_id)
        AND EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = messages.group_id AND gm.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "messages_insert_active_student" ON public.messages;
CREATE POLICY "messages_insert_active_student" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND public.is_active_student()
    AND (
      group_id IS NULL
      OR (
        public.is_eligible_for_group(messages.group_id)
        AND EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = messages.group_id AND gm.user_id = auth.uid()
        )
      )
    )
  );
