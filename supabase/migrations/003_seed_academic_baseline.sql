-- ============================================================================
-- Dharanidhar University Student Hub - Idempotent Academic Baseline Seed
-- NOTE: No passwords, secrets, or fabricated student records are seeded here.
-- Super Admin (5301K24032) is provisioned separately via server-side env secret.
-- ============================================================================

-- 1. Singleton Security Settings
INSERT INTO public.security_settings (
  id,
  institution_name,
  require_admin_approval,
  enforce_first_login_password_change,
  min_password_length,
  max_devices_per_student,
  session_timeout_hours,
  allow_student_direct_messages,
  maintenance_mode
)
VALUES (
  1,
  'Dharanidhar University',
  TRUE,
  TRUE,
  10,
  5,
  72,
  TRUE,
  FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 2. Initial Department: Chemistry
INSERT INTO public.departments (code, name, faculty_area, description, is_active)
VALUES (
  'CHEM',
  'Chemistry',
  'School of Physical & Chemical Sciences',
  'Department of Chemistry, Dharanidhar University, Keonjhar, Odisha.',
  TRUE
)
ON CONFLICT (code) DO NOTHING;

-- 3. Initial Course: B.Sc. Chemistry
INSERT INTO public.courses (department_id, code, name, degree_level, duration_years, total_semesters, is_active)
SELECT
  d.id,
  'BSC-CHEM',
  'B.Sc. Chemistry',
  'Undergraduate',
  3,
  6,
  TRUE
FROM public.departments d
WHERE d.code = 'CHEM'
ON CONFLICT (code) DO NOTHING;

-- 4. Initial Cohort Batch for B.Sc. Chemistry (2024–2027)
INSERT INTO public.batches (department_id, course_id, name, admission_year, graduation_year, current_semester, section, is_active)
SELECT
  d.id,
  c.id,
  'B.Sc. Chemistry (2024–2027)',
  2024,
  2027,
  1,
  'A',
  TRUE
FROM public.departments d
JOIN public.courses c ON c.department_id = d.id AND c.code = 'BSC-CHEM'
WHERE d.code = 'CHEM'
ON CONFLICT (course_id, admission_year, section) DO NOTHING;

-- 5. Official Campus & Chemistry Department Groups
INSERT INTO public.groups (name, slug, description, group_type, department_id, is_active)
VALUES (
  'Dharanidhar University Commons',
  'ddu-commons',
  'University-wide student commons for Dharanidhar University, Keonjhar.',
  'official',
  NULL,
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.groups (name, slug, description, group_type, department_id, course_id, is_active)
SELECT
  'Department of Chemistry',
  'dept-chemistry',
  'Official academic and laboratory coordination channel for Chemistry students.',
  'department',
  d.id,
  c.id,
  TRUE
FROM public.departments d
LEFT JOIN public.courses c ON c.department_id = d.id AND c.code = 'BSC-CHEM'
WHERE d.code = 'CHEM'
ON CONFLICT (slug) DO NOTHING;
