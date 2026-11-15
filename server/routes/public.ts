import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import {
  getSupabaseAdmin,
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
  isSupabasePublicConfigured,
  normalizeStudentId,
} from '../supabaseAdmin.ts';
import { extractClientIp, requireAuth } from '../middleware/auth.ts';
import {
  INITIAL_SUPER_ADMIN_STUDENT_ID,
  provisionInitialSuperAdmin,
} from '../services/provisionSuperAdmin.ts';
import {
  fetchTeacherMetadataMap,
  hasTeacher007Columns,
  hasTeacher009Column,
  isMissingColumnOrSchemaError,
  mergeTeacherWithMetadata,
} from '../services/teacherProfileCompat.ts';
import { loadStudentBadgesMap } from '../services/studentBadgeService.ts';

export const publicRouter = Router();

publicRouter.get('/health', async (_req, res) => {
  const publicConfigured = isSupabasePublicConfigured();
  const adminConfigured = isSupabaseAdminConfigured();
  const initialPasswordConfigured = Boolean(
    process.env.SUPER_ADMIN_INITIAL_PASSWORD &&
      process.env.SUPER_ADMIN_INITIAL_PASSWORD !== 'SET_STRONG_INITIAL_PASSWORD_IN_ENV' &&
      process.env.SUPER_ADMIN_INITIAL_PASSWORD.length >= 10
  );

  let superAdminProvisioned = false;
  let schemaReady = false;
  let teachersSchemaReady = false;
  let teachersCount = 0;
  let databaseError: string | null = null;

  if (adminConfigured) {
    try {
      const admin = getSupabaseAdmin();
      const [{ data, error }, { count: tCount, error: tErr }] = await Promise.all([
        admin
          .from('students')
          .select('id')
          .eq('student_id', INITIAL_SUPER_ADMIN_STUDENT_ID)
          .maybeSingle(),
        admin
          .from('teachers')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
      ]);

      if (error) {
        databaseError = error.message;
      } else {
        schemaReady = true;
        superAdminProvisioned = Boolean(data);
      }

      if (!tErr) {
        teachersSchemaReady = true;
        teachersCount = tCount ?? 0;
      }
    } catch (err) {
      databaseError = err instanceof Error ? err.message : 'Database check failed';
    }
  }

  res.json({
    ok: true,
    institution: 'Dharanidhar University, Keonjhar, Odisha, India',
    supabasePublicConfigured: publicConfigured,
    supabaseAdminConfigured: adminConfigured,
    initialPasswordConfigured: initialPasswordConfigured,
    schemaReady,
    superAdminProvisioned,
    teachersSchemaReady,
    teachersCount,
    provisioningTokenRequired: Boolean(process.env.PROVISIONING_ADMIN_TOKEN),
    databaseError,
  });
});

publicRouter.get('/public/config', (_req, res) => {
  if (!isSupabasePublicConfigured()) {
    res.json({ configured: false });
    return;
  }
  res.json({
    configured: true,
    supabaseUrl: getSupabaseUrl(),
    supabaseAnonKey: getSupabaseAnonKey(),
  });
});

publicRouter.get('/setup/migration-sql', (_req, res) => {
  try {
    const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
    const files = [
      '001_initial_schema.sql',
      '002_rls_and_security.sql',
      '003_seed_academic_baseline.sql',
      '004_department_group_isolation.sql',
      '005_group_images.sql',
      '006_teacher_portal.sql',
      '007_teacher_professional_profiles.sql',
      '008_announcement_media.sql',
      '009_teacher_honorific.sql',
      '010_student_tags_and_badges.sql',
    ];
    const parts = files.map((file) => {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      return `-- >>> ${file} <<<\n${content}`;
    });
    res.json({ sql: parts.join('\n\n') });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unable to read migration SQL files.',
    });
  }
});

publicRouter.get('/public/academics', async (_req, res) => {
  if (!isSupabaseAdminConfigured()) {
    res.status(503).json({ error: 'Supabase is not yet configured on the server.' });
    return;
  }

  try {
    const admin = getSupabaseAdmin();
    const [{ data: departments, error: deptErr }, { data: courses, error: courseErr }, { data: batches, error: batchErr }] =
      await Promise.all([
        admin.from('departments').select('id, code, name, faculty_area').eq('is_active', true).order('name'),
        admin
          .from('courses')
          .select('id, department_id, code, name, degree_level, duration_years, total_semesters')
          .eq('is_active', true)
          .order('name'),
        admin
          .from('batches')
          .select('id, department_id, course_id, name, admission_year, graduation_year, current_semester, section')
          .eq('is_active', true)
          .order('admission_year', { ascending: false }),
      ]);

    if (deptErr || courseErr || batchErr) {
      res.status(500).json({ error: deptErr?.message || courseErr?.message || batchErr?.message });
      return;
    }

    res.json({
      departments: departments || [],
      courses: courses || [],
      batches: batches || [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch academic catalog.' });
  }
});

publicRouter.post('/registration-requests', async (req, res) => {
  if (!isSupabaseAdminConfigured()) {
    res.status(503).json({ error: 'Supabase is not configured.' });
    return;
  }

  try {
    const {
      studentId,
      fullName,
      personalEmail,
      phone,
      departmentId,
      courseId,
      batchId,
      admissionYear,
      supportingNote,
    } = req.body || {};

    if (!studentId || !fullName || !personalEmail || !departmentId || !courseId || !admissionYear) {
      res.status(400).json({
        error: 'Student ID, full name, email, department, course, and admission year are required.',
      });
      return;
    }

    const normalizedId = normalizeStudentId(String(studentId));
    if (normalizedId.length < 4 || !/^[A-Z0-9/_-]+$/.test(normalizedId)) {
      res.status(400).json({ error: 'Enter a valid alphanumeric Student ID (minimum 4 characters).' });
      return;
    }

    const emailTrimmed = String(personalEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    const admin = getSupabaseAdmin();

    // Check if already a registered student
    const { data: existingStudent } = await admin
      .from('students')
      .select('id')
      .eq('student_id', normalizedId)
      .maybeSingle();

    if (existingStudent) {
      res.status(409).json({
        error: 'This Student ID is already registered. Please sign in or request a password reset.',
      });
      return;
    }

    // Check if an active pending/approved request already exists
    const { data: existingRequest } = await admin
      .from('registration_requests')
      .select('id, status')
      .eq('student_id', normalizedId)
      .in('status', ['pending', 'approved'])
      .maybeSingle();

    if (existingRequest) {
      res.status(409).json({
        error: `A registration request for ${normalizedId} is already ${existingRequest.status}.`,
      });
      return;
    }

    // Explicitly insert only allowed student onboarding fields (never roles)
    const { data: created, error: insertErr } = await admin
      .from('registration_requests')
      .insert({
        student_id: normalizedId,
        full_name: String(fullName).trim(),
        personal_email: emailTrimmed,
        phone: phone ? String(phone).trim() : null,
        department_id: String(departmentId),
        course_id: String(courseId),
        batch_id: batchId ? String(batchId) : null,
        admission_year: Number(admissionYear),
        supporting_note: supportingNote ? String(supportingNote).trim().slice(0, 500) : null,
        status: 'pending',
      })
      .select('id, student_id, status, created_at')
      .single();

    if (insertErr) {
      res.status(400).json({ error: insertErr.message });
      return;
    }

    res.status(201).json({
      request: created,
      message: 'Registration request submitted. An administrator will verify and approve your Student ID.',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to submit registration request.' });
  }
});

publicRouter.post('/setup/provision-super-admin', async (req, res) => {
  try {
    const requiredToken = (process.env.PROVISIONING_ADMIN_TOKEN || '').trim();
    if (requiredToken) {
      const provided = String(req.headers['x-provisioning-token'] || req.body?.provisioningToken || '').trim();
      if (provided !== requiredToken) {
        res.status(403).json({ error: 'Invalid or missing provisioning token.' });
        return;
      }
    }

    const result = await provisionInitialSuperAdmin(extractClientIp(req));
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Super Admin provisioning failed.',
    });
  }
});

// ----------------------------------------------------------------------------
// Faculty / Teachers Public Directory (Authenticated Students, Teachers, Admins)
// ----------------------------------------------------------------------------
function isTeachersTableMissingError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = (err.code || '').toUpperCase();
  const msg = (err.message || '').toLowerCase();
  if (code === '42P01' || code === 'PGRST205') return true;
  if (msg.includes('could not find the table') && msg.includes('teachers')) return true;
  if (msg.includes('relation') && msg.includes('teachers') && msg.includes('does not exist')) return true;
  return false;
}

publicRouter.get('/faculty', requireAuth, async (_req, res) => {
  try {
    const admin = getSupabaseAdmin();
    const [{ data: allDepartments, error: deptErr }, { data: teachers, error: teacherErr }] =
      await Promise.all([
        admin.from('departments').select('*').order('name'),
        admin
          .from('teachers')
          .select(
            'id, user_id, teacher_id, honorific, full_name, department_id, designation, specialization, personal_email, phone, avatar_url, qualification, experience_years, subjects_taught, research_areas, office_location, office_hours, bio, website_url, publications_summary, profile_completed, profile_updated_at, department:departments(id, code, name, faculty_area)'
          )
          .eq('is_active', true)
          .order('full_name'),
      ]);

    if (deptErr) {
      res.status(500).json({ error: deptErr.message });
      return;
    }

    const activeDepartments = (allDepartments || []).filter((d) => d.is_active !== false);
    const deptById = new Map(
      (allDepartments || []).map((d) => [
        String(d.id),
        { id: d.id, code: d.code, name: d.name, faculty_area: d.faculty_area },
      ])
    );

    if (teacherErr) {
      if (isTeachersTableMissingError(teacherErr)) {
        res.json({ teachers: [], departments: activeDepartments, schemaReady: false });
        return;
      }

      if (isMissingColumnOrSchemaError(teacherErr.message)) {
        // Fallback if 007/009 columns or PostgREST teachers->departments relationship aren't cached yet
        const { data: rawTeachers, error: rawErr } = await admin
          .from('teachers')
          .select('*')
          .eq('is_active', true)
          .order('full_name');

        if (rawErr) {
          if (isTeachersTableMissingError(rawErr)) {
            res.json({ teachers: [], departments: activeDepartments, schemaReady: false });
            return;
          }
          res.status(500).json({ error: rawErr.message });
          return;
        }

        const metaMap = await fetchTeacherMetadataMap(admin);
        const merged = (rawTeachers || []).map((row) => {
          const rec = row as Record<string, unknown>;
          const enriched = mergeTeacherWithMetadata(
            rec,
            metaMap.get(String(rec.user_id)) || null
          );
          return {
            ...enriched,
            department: deptById.get(String(rec.department_id)) || null,
          };
        });

        res.json({
          teachers: merged,
          departments: activeDepartments,
          schemaReady: true,
        });
        return;
      }

      res.status(500).json({ error: teacherErr.message });
      return;
    }

    let resolvedTeachers = (teachers || []) as Record<string, unknown>[];
    if (
      resolvedTeachers.some(
        (r) => !hasTeacher007Columns(r) || !hasTeacher009Column(r) || !r.profile_completed
      )
    ) {
      const metaMap = await fetchTeacherMetadataMap(admin);
      resolvedTeachers = resolvedTeachers.map((row) =>
        mergeTeacherWithMetadata(row, metaMap.get(String(row.user_id)) || null)
      );
    }

    res.json({
      teachers: resolvedTeachers,
      departments: activeDepartments,
      schemaReady: true,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load faculty profiles.' });
  }
});

// ----------------------------------------------------------------------------
// Public Student Role Badges (3/2/1 Stars) & Custom Student Tags
// ----------------------------------------------------------------------------
publicRouter.get('/student-badges', requireAuth, async (_req, res) => {
  try {
    const admin = getSupabaseAdmin();
    const badges = await loadStudentBadgesMap(admin);
    res.json({ badges });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load student badges.',
    });
  }
});
