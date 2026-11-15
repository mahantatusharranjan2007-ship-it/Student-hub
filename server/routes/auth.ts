import crypto from 'node:crypto';
import { Router } from 'express';
import {
  createSupabaseAnonClient,
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
  isSupabasePublicConfigured,
  normalizeStudentId,
  writeAuditLog,
  type AppRole,
} from '../supabaseAdmin.ts';
import { extractClientIp, requireAuth } from '../middleware/auth.ts';
import {
  hasTeacher007Columns,
  hasTeacher009Column,
  mergeTeacherWithMetadata,
} from '../services/teacherProfileCompat.ts';

export const authRouter = Router();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

authRouter.post('/login', async (req, res) => {
  if (!isSupabaseAdminConfigured() || !isSupabasePublicConfigured()) {
    res.status(503).json({ error: 'Supabase authentication is not configured yet.' });
    return;
  }

  try {
    const { studentId, password, deviceFingerprint, deviceName, platform } = req.body || {};
    if (!studentId || !password) {
      res.status(400).json({ error: 'Student / Teacher ID and password are required.' });
      return;
    }

    const normalizedId = normalizeStudentId(String(studentId));
    const admin = getSupabaseAdmin();

    // 1. Locate student OR teacher record by ID
    const { data: student, error: studentErr } = await admin
      .from('students')
      .select(
        `
        *,
        department:departments(id, code, name, faculty_area),
        course:courses(id, code, name, degree_level, duration_years, total_semesters),
        batch:batches(id, name, admission_year, graduation_year, current_semester, section)
      `
      )
      .eq('student_id', normalizedId)
      .maybeSingle();

    let teacher: Record<string, unknown> | null = null;
    if (!student) {
      const { data: teacherRow, error: teacherErr } = await admin
        .from('teachers')
        .select('*, department:departments(id, code, name, faculty_area)')
        .eq('teacher_id', normalizedId)
        .maybeSingle();
      if (!teacherErr && teacherRow) {
        teacher = teacherRow as Record<string, unknown>;
      }
    }

    if ((studentErr && !teacher) || (!student && !teacher)) {
      res.status(401).json({ error: 'Invalid ID or password.' });
      return;
    }

    const targetUserId = student ? student.user_id : String(teacher!.user_id);

    // 2. Resolve Supabase Auth email for this user
    const { data: authUserResult, error: authLookupErr } = await admin.auth.admin.getUserById(targetUserId);
    if (authLookupErr || !authUserResult?.user?.email) {
      res.status(401).json({ error: 'Invalid ID or password.' });
      return;
    }

    // 3. Authenticate using Supabase Auth (real password hash verification & JWT issuance)
    const anonClient = createSupabaseAnonClient();
    const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: authUserResult.user.email,
      password: String(password),
    });

    if (signInErr || !signInData.session || !signInData.user) {
      res.status(401).json({ error: 'Invalid ID or password.' });
      return;
    }

    // 4. Enforce account status after password verification (prevents enumeration)
    if (student && student.student_status === 'suspended') {
      res.status(403).json({
        error: 'Your student account is suspended. Please contact a university administrator.',
      });
      return;
    }

    if (teacher && teacher.is_active === false) {
      res.status(403).json({
        error: 'Your teacher account is currently inactive. Please contact a university administrator.',
      });
      return;
    }

    // 5. Register device and create session log
    const fingerprint = String(deviceFingerprint || 'web-browser-default').slice(0, 128);
    const devName = String(deviceName || 'Web Browser').slice(0, 120);
    const devPlatform = String(platform || 'web').slice(0, 40);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
    const ipAddress = extractClientIp(req);

    const { data: deviceRow } = await admin
      .from('registered_devices')
      .upsert(
        {
          user_id: targetUserId,
          device_fingerprint: fingerprint,
          device_name: devName,
          platform: devPlatform,
          user_agent: userAgent,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_fingerprint' }
      )
      .select('id, is_revoked')
      .single();

    if (deviceRow?.is_revoked) {
      res.status(403).json({
        error: 'This device has been revoked by an administrator or your security settings.',
      });
      return;
    }

    if (deviceRow?.id) {
      await admin.from('device_sessions').insert({
        user_id: targetUserId,
        device_id: deviceRow.id,
        session_token_hash: hashToken(signInData.session.access_token),
        ip_address: ipAddress,
        user_agent: userAgent,
        is_active: true,
      });
    }

    // 6a. Teacher Session Response
    if (teacher) {
      await admin
        .from('teachers')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', String(teacher.id));

      await writeAuditLog({
        actorUserId: targetUserId,
        actorStudentId: String(teacher.teacher_id),
        actorRole: 'teacher',
        action: 'TEACHER_LOGIN',
        targetType: 'session',
        targetId: deviceRow?.id ?? null,
        summary: `Teacher ${teacher.teacher_id} (${teacher.full_name}) authenticated from ${devName}.`,
        ipAddress,
      });

      const mergedTeacher = mergeTeacherWithMetadata(
        teacher,
        (authUserResult.user.user_metadata as Record<string, unknown>) || null
      );

      res.json({
        session: signInData.session,
        user: signInData.user,
        accountType: 'teacher',
        student: null,
        profile: null,
        teacher: mergedTeacher,
        roles: ['teacher'] as AppRole[],
        adminRoles: [],
      });
      return;
    }

    // 6b. Student / Admin Session Response
    await admin
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', student.user_id);

    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      admin.from('profiles').select('*').eq('id', student.user_id).single(),
      admin
        .from('admin_roles')
        .select('*')
        .eq('user_id', student.user_id)
        .eq('is_active', true)
        .is('revoked_at', null),
    ]);

    const adminRoles = (roleRows || []).map((r) => r.role as AppRole);
    const roles: AppRole[] = [...adminRoles, 'student'];

    if (adminRoles.length > 0) {
      await writeAuditLog({
        actorUserId: student.user_id,
        actorStudentId: student.student_id,
        actorRole: adminRoles[0],
        action: 'ADMIN_LOGIN',
        targetType: 'session',
        targetId: deviceRow?.id ?? null,
        summary: `Authenticated ${student.student_id} (${adminRoles.join(', ')}) from ${devName}.`,
        ipAddress,
      });
    }

    res.json({
      session: signInData.session,
      user: signInData.user,
      accountType: 'student',
      student,
      profile,
      teacher: null,
      roles,
      adminRoles: roleRows || [],
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication service encountered an error.' });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const ctx = req.authContext!;
    const admin = getSupabaseAdmin();

    if (ctx.accountType === 'teacher') {
      const { data: teacher, error } = await admin
        .from('teachers')
        .select('*, department:departments(id, code, name, faculty_area)')
        .eq('user_id', ctx.userId)
        .single();

      if (error || !teacher) {
        res.status(404).json({ error: 'Teacher account not found.' });
        return;
      }

      let resolvedTeacher = teacher as Record<string, unknown>;
      if (
        !hasTeacher007Columns(resolvedTeacher) ||
        !hasTeacher009Column(resolvedTeacher) ||
        !resolvedTeacher.profile_completed
      ) {
        const { data: authUser } = await admin.auth.admin.getUserById(ctx.userId);
        resolvedTeacher = mergeTeacherWithMetadata(
          resolvedTeacher,
          (authUser?.user?.user_metadata as Record<string, unknown>) || null
        );
      }

      res.json({
        accountType: 'teacher',
        student: null,
        profile: null,
        teacher: resolvedTeacher,
        roles: ctx.roles,
        adminRoles: [],
      });
      return;
    }

    const [{ data: student }, { data: profile }, { data: roleRows }] = await Promise.all([
      admin
        .from('students')
        .select(
          `
          *,
          department:departments(id, code, name, faculty_area),
          course:courses(id, code, name, degree_level, duration_years, total_semesters),
          batch:batches(id, name, admission_year, graduation_year, current_semester, section)
        `
        )
        .eq('user_id', ctx.userId)
        .single(),
      admin.from('profiles').select('*').eq('id', ctx.userId).single(),
      admin
        .from('admin_roles')
        .select('*')
        .eq('user_id', ctx.userId)
        .eq('is_active', true)
        .is('revoked_at', null),
    ]);

    res.json({
      accountType: 'student',
      student,
      profile,
      teacher: null,
      roles: ctx.roles,
      adminRoles: roleRows || [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load user context.' });
  }
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }

    if (String(currentPassword) === String(newPassword)) {
      res.status(400).json({ error: 'New password must be different from your current password.' });
      return;
    }

    const admin = getSupabaseAdmin();

    // Check institutional minimum password length
    const { data: settings } = await admin
      .from('security_settings')
      .select('min_password_length')
      .eq('id', 1)
      .maybeSingle();

    const minLen = settings?.min_password_length ?? 10;
    const nextPass = String(newPassword);
    if (nextPass.length < minLen) {
      res.status(400).json({ error: `Password must be at least ${minLen} characters long.` });
      return;
    }

    if (!/[A-Za-z]/.test(nextPass) || !/[0-9]/.test(nextPass)) {
      res.status(400).json({ error: 'Password must include both letters and numbers.' });
      return;
    }

    // Verify current password using Supabase Auth
    const { data: authUser } = await admin.auth.admin.getUserById(ctx.userId);
    if (!authUser?.user?.email) {
      res.status(400).json({ error: 'Unable to verify account credentials.' });
      return;
    }

    const anonClient = createSupabaseAnonClient();
    const { error: verifyErr } = await anonClient.auth.signInWithPassword({
      email: authUser.user.email,
      password: String(currentPassword),
    });

    if (verifyErr) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    // Apply password update securely via Supabase Auth Admin
    const { error: updateAuthErr } = await admin.auth.admin.updateUserById(ctx.userId, {
      password: nextPass,
    });

    if (updateAuthErr) {
      res.status(400).json({ error: updateAuthErr.message });
      return;
    }

    const nowIso = new Date().toISOString();
    if (ctx.accountType === 'teacher') {
      const { error: teacherErr } = await admin
        .from('teachers')
        .update({
          must_change_password: false,
          password_changed_at: nowIso,
        })
        .eq('user_id', ctx.userId);

      if (teacherErr) {
        res.status(500).json({ error: teacherErr.message });
        return;
      }
    } else {
      const { error: profileErr } = await admin
        .from('profiles')
        .update({
          must_change_password: false,
          password_changed_at: nowIso,
        })
        .eq('id', ctx.userId);

      if (profileErr) {
        res.status(500).json({ error: profileErr.message });
        return;
      }
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: ctx.isSuperAdmin ? 'super_admin' : ctx.roles[0],
      action: 'PASSWORD_CHANGED',
      targetType: ctx.accountType,
      targetId: ctx.userId,
      summary: `${ctx.accountType === 'teacher' ? 'Teacher' : 'Student'} ${ctx.studentId} completed password update.`,
      ipAddress: ctx.ipAddress,
    });

    res.json({
      ok: true,
      mustChangePassword: false,
      message: 'Password updated successfully.',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update password.' });
  }
});

authRouter.post('/request-password-reset', async (req, res) => {
  if (!isSupabaseAdminConfigured() || !isSupabasePublicConfigured()) {
    res.status(503).json({ error: 'Supabase is not configured.' });
    return;
  }

  try {
    const { studentId, personalEmail } = req.body || {};
    if (!studentId || !personalEmail) {
      res.status(400).json({ error: 'ID and registered personal email are required.' });
      return;
    }

    const normalizedId = normalizeStudentId(String(studentId));
    const emailInput = String(personalEmail).trim().toLowerCase();
    const admin = getSupabaseAdmin();

    const { data: profile } = await admin
      .from('profiles')
      .select('id, student_id, personal_email')
      .eq('student_id', normalizedId)
      .maybeSingle();

    let targetUserId: string | null = null;
    let targetRole: string = 'student';

    if (profile && profile.personal_email && profile.personal_email.toLowerCase() === emailInput) {
      targetUserId = profile.id;
    } else {
      const { data: teacherRow, error: teacherErr } = await admin
        .from('teachers')
        .select('user_id, teacher_id, personal_email')
        .eq('teacher_id', normalizedId)
        .maybeSingle();

      if (
        !teacherErr &&
        teacherRow &&
        teacherRow.personal_email &&
        teacherRow.personal_email.toLowerCase() === emailInput
      ) {
        targetUserId = teacherRow.user_id;
        targetRole = 'teacher';
      }
    }

    if (targetUserId) {
      const { data: authUser } = await admin.auth.admin.getUserById(targetUserId);
      if (authUser?.user?.email) {
        const anonClient = createSupabaseAnonClient();
        await anonClient.auth.resetPasswordForEmail(authUser.user.email, {
          redirectTo: `${process.env.APP_URL || ''}/`,
        });
      }

      await writeAuditLog({
        actorUserId: targetUserId,
        actorStudentId: normalizedId,
        actorRole: targetRole,
        action: 'PASSWORD_RESET_REQUESTED',
        targetType: targetRole,
        targetId: targetUserId,
        summary: `Password reset requested for ID ${normalizedId}.`,
        ipAddress: extractClientIp(req),
      });
    }

    // Always return non-enumerating confirmation
    res.json({
      ok: true,
      message:
        'If the ID and personal email match an active account, recovery instructions have been triggered. Otherwise, contact a Super Admin to issue a one-time reset.',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Reset request failed.' });
  }
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  try {
    const ctx = req.authContext!;
    const admin = getSupabaseAdmin();
    await admin
      .from('device_sessions')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('user_id', ctx.userId)
      .eq('session_token_hash', hashToken(ctx.accessToken));

    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});
