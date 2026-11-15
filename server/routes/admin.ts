import crypto from 'node:crypto';
import { Router } from 'express';
import {
  getSupabaseAdmin,
  normalizeStudentId,
  studentIdToAuthEmail,
  teacherIdToAuthEmail,
  writeAuditLog,
  type AppRole,
} from '../supabaseAdmin.ts';
import { requireAuth, requireRoles } from '../middleware/auth.ts';
import { uploadAnnouncementMedia, type AnnouncementMediaKind } from '../services/announcementMedia.ts';
import {
  fetchTeacherMetadataMap,
  hasTeacher007Columns,
  hasTeacher009Column,
  isMissingColumnOrSchemaError,
  mergeTeacherWithMetadata,
  saveTeacherExtendedMetadata,
} from '../services/teacherProfileCompat.ts';
import { saveStudentCustomTag } from '../services/studentBadgeService.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth);

function generateTemporaryPassword(): string {
  // 14-char URL-safe mixed temporary password (never stored in DB)
  const raw = crypto.randomBytes(9).toString('base64url');
  return `${raw}A9!`;
}

// ----------------------------------------------------------------------------
// Dashboard Overview Counts
// ----------------------------------------------------------------------------
adminRouter.get('/overview', requireRoles(['super_admin', 'batch_admin', 'moderator']), async (_req, res) => {
  try {
    const admin = getSupabaseAdmin();
    const [
      pendingRequests,
      totalStudents,
      activeStudents,
      departmentsCount,
      coursesCount,
      batchesCount,
      groupsCount,
      announcementsCount,
      openReportsCount,
      activeAdminsCount,
      activeSessionsCount,
      recentLogs,
    ] = await Promise.all([
      admin.from('registration_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('students').select('*', { count: 'exact', head: true }),
      admin.from('students').select('*', { count: 'exact', head: true }).eq('student_status', 'active'),
      admin.from('departments').select('*', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('courses').select('*', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('batches').select('*', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('groups').select('*', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('announcements').select('*', { count: 'exact', head: true }).eq('is_published', true),
      admin.from('moderation_reports').select('*', { count: 'exact', head: true }).in('status', ['open', 'reviewing']),
      admin.from('admin_roles').select('*', { count: 'exact', head: true }).eq('is_active', true).is('revoked_at', null),
      admin.from('device_sessions').select('*', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(8),
    ]);

    res.json({
      stats: {
        pendingRequests: pendingRequests.count ?? 0,
        totalStudents: totalStudents.count ?? 0,
        activeStudents: activeStudents.count ?? 0,
        departments: departmentsCount.count ?? 0,
        courses: coursesCount.count ?? 0,
        batches: batchesCount.count ?? 0,
        groups: groupsCount.count ?? 0,
        announcements: announcementsCount.count ?? 0,
        openReports: openReportsCount.count ?? 0,
        activeAdmins: activeAdminsCount.count ?? 0,
        activeSessions: activeSessionsCount.count ?? 0,
      },
      recentLogs: recentLogs.data || [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load overview.' });
  }
});

// ----------------------------------------------------------------------------
// Approve / Reject Registration Requests
// ----------------------------------------------------------------------------
adminRouter.post(
  '/registration-requests/:id/approve',
  requireRoles(['super_admin', 'batch_admin']),
  async (req, res) => {
    try {
      const ctx = req.authContext!;
      const requestId = req.params.id;
      const admin = getSupabaseAdmin();

      const { data: regReq, error: reqErr } = await admin
        .from('registration_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (reqErr || !regReq) {
        res.status(404).json({ error: 'Registration request not found.' });
        return;
      }

      if (regReq.status !== 'pending') {
        res.status(409).json({ error: `Request is already ${regReq.status}.` });
        return;
      }

      // Create Supabase Auth user with temporary password
      const tempPassword = generateTemporaryPassword();
      const authEmail = studentIdToAuthEmail(regReq.student_id);

      const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
        email: authEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          student_id: regReq.student_id,
          full_name: regReq.full_name,
          must_change_password: true,
        },
      });

      if (authErr || !createdAuth?.user) {
        res.status(400).json({ error: authErr?.message || 'Failed to create Supabase Auth user.' });
        return;
      }

      const newUserId = createdAuth.user.id;

      // Create Student record
      const { data: newStudent, error: studentErr } = await admin
        .from('students')
        .insert({
          user_id: newUserId,
          student_id: regReq.student_id,
          full_name: regReq.full_name,
          institution: 'Dharanidhar University',
          campus_location: 'Keonjhar, Odisha, India',
          department_id: regReq.department_id,
          course_id: regReq.course_id,
          batch_id: regReq.batch_id,
          semester: 1,
          student_status: 'active',
          academic_status: 'studying',
          verification_status: 'verified',
          is_initial_provisioned: false,
        })
        .select('*')
        .single();

      if (studentErr || !newStudent) {
        await admin.auth.admin.deleteUser(newUserId);
        res.status(400).json({ error: studentErr?.message || 'Failed to create student record.' });
        return;
      }

      // Create Profile record (must_change_password = true)
      const { error: profileErr } = await admin.from('profiles').insert({
        id: newUserId,
        student_record_id: newStudent.id,
        student_id: regReq.student_id,
        display_name: regReq.full_name,
        personal_email: regReq.personal_email,
        phone: regReq.phone,
        must_change_password: true,
        privacy_directory_visible: true,
      });

      if (profileErr) {
        await admin.auth.admin.deleteUser(newUserId);
        res.status(400).json({ error: profileErr.message });
        return;
      }

      // Mark registration request approved
      await admin
        .from('registration_requests')
        .update({
          status: 'approved',
          reviewed_by: ctx.userId,
          reviewed_at: new Date().toISOString(),
          created_user_id: newUserId,
        })
        .eq('id', requestId);

      // Join relevant official/department groups matching student's department, course, and batch
      const { data: matchingGroups } = await admin
        .from('groups')
        .select('id, slug, department_id, course_id, batch_id')
        .eq('is_active', true)
        .or(`slug.eq.ddu-commons,department_id.eq.${regReq.department_id}`);

      const eligibleGroups = (matchingGroups || []).filter(
        (g) =>
          (!g.department_id || g.department_id === regReq.department_id) &&
          (!g.course_id || g.course_id === regReq.course_id) &&
          (!g.batch_id || g.batch_id === regReq.batch_id)
      );

      if (eligibleGroups.length > 0) {
        await admin.from('group_members').upsert(
          eligibleGroups.map((g) => ({
            group_id: g.id,
            user_id: newUserId,
            member_role: 'member',
          })),
          { onConflict: 'group_id,user_id', ignoreDuplicates: true }
        );
      }

      await writeAuditLog({
        actorUserId: ctx.userId,
        actorStudentId: ctx.studentId,
        actorRole: ctx.isSuperAdmin ? 'super_admin' : 'batch_admin',
        action: 'REGISTRATION_APPROVED',
        targetType: 'student',
        targetId: newStudent.id,
        summary: `Approved registration request for ${regReq.student_id} (${regReq.full_name}).`,
        ipAddress: ctx.ipAddress,
      });

      res.json({
        student: newStudent,
        temporaryPassword: tempPassword,
        message: 'Student approved and provisioned. Share the one-time temporary password securely.',
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Approval failed.' });
    }
  }
);

adminRouter.post(
  '/registration-requests/:id/reject',
  requireRoles(['super_admin', 'batch_admin']),
  async (req, res) => {
    try {
      const ctx = req.authContext!;
      const requestId = req.params.id;
      const reason = String(req.body?.reason || 'Insufficient verification details').trim();
      const admin = getSupabaseAdmin();

      const { data: regReq, error } = await admin
        .from('registration_requests')
        .update({
          status: 'rejected',
          reviewed_by: ctx.userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('*')
        .single();

      if (error || !regReq) {
        res.status(404).json({ error: 'Pending registration request not found.' });
        return;
      }

      await writeAuditLog({
        actorUserId: ctx.userId,
        actorStudentId: ctx.studentId,
        actorRole: ctx.isSuperAdmin ? 'super_admin' : 'batch_admin',
        action: 'REGISTRATION_REJECTED',
        targetType: 'registration_request',
        targetId: requestId,
        summary: `Rejected registration request for ${regReq.student_id}. Reason: ${reason}`,
        ipAddress: ctx.ipAddress,
      });

      res.json({ request: regReq });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Rejection failed.' });
    }
  }
);

// ----------------------------------------------------------------------------
// Student Management & Password Reset
// ----------------------------------------------------------------------------
adminRouter.patch('/students/:id', requireRoles(['super_admin', 'batch_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const studentRecordId = req.params.id;
    const {
      full_name,
      department_id,
      course_id,
      batch_id,
      semester,
      roll_number,
      student_status,
      academic_status,
      verification_status,
    } = req.body || {};

    const admin = getSupabaseAdmin();
    const updates: Record<string, unknown> = {};
    if (full_name !== undefined) updates.full_name = String(full_name).trim();
    if (department_id !== undefined) updates.department_id = department_id;
    if (course_id !== undefined) updates.course_id = course_id;
    if (batch_id !== undefined) updates.batch_id = batch_id || null;
    if (semester !== undefined) updates.semester = Number(semester);
    if (roll_number !== undefined) updates.roll_number = roll_number ? String(roll_number).trim() : null;
    if (student_status !== undefined) updates.student_status = student_status;
    if (academic_status !== undefined) updates.academic_status = academic_status;
    if (verification_status !== undefined) updates.verification_status = verification_status;

    const { data: updated, error } = await admin
      .from('students')
      .update(updates)
      .eq('id', studentRecordId)
      .select('*')
      .single();

    if (error || !updated) {
      res.status(400).json({ error: error?.message || 'Student update failed.' });
      return;
    }

    // Remove any group memberships that no longer match this student's department/course/batch
    const { data: userMemberships } = await admin
      .from('group_members')
      .select('id, group:groups(id, department_id, course_id, batch_id)')
      .eq('user_id', updated.user_id);

    const mismatchedIds = (userMemberships || [])
      .filter((m: { id: string; group: unknown }) => {
        const g = m.group as {
          department_id: string | null;
          course_id: string | null;
          batch_id: string | null;
        } | null;
        if (!g) return false;
        return (
          (g.department_id && g.department_id !== updated.department_id) ||
          (g.course_id && g.course_id !== updated.course_id) ||
          (g.batch_id && g.batch_id !== updated.batch_id)
        );
      })
      .map((m: { id: string }) => m.id);

    if (mismatchedIds.length > 0) {
      await admin.from('group_members').delete().in('id', mismatchedIds);
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: ctx.isSuperAdmin ? 'super_admin' : 'batch_admin',
      action: 'STUDENT_UPDATED',
      targetType: 'student',
      targetId: updated.id,
      summary: `Updated student record ${updated.student_id} (${Object.keys(updates).join(', ')}).`,
      metadata: updates,
      ipAddress: ctx.ipAddress,
    });

    res.json({ student: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Student update failed.' });
  }
});

adminRouter.post('/students/:id/reset-password', requireRoles(['super_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const studentRecordId = req.params.id;
    const admin = getSupabaseAdmin();

    const { data: student } = await admin
      .from('students')
      .select('id, user_id, student_id')
      .eq('id', studentRecordId)
      .single();

    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const tempPassword = generateTemporaryPassword();
    const { error: authErr } = await admin.auth.admin.updateUserById(student.user_id, {
      password: tempPassword,
    });

    if (authErr) {
      res.status(400).json({ error: authErr.message });
      return;
    }

    await Promise.all([
      admin.from('profiles').update({ must_change_password: true }).eq('id', student.user_id),
      admin
        .from('device_sessions')
        .update({ is_active: false, revoked_at: new Date().toISOString(), revoked_by: ctx.userId })
        .eq('user_id', student.user_id)
        .eq('is_active', true),
    ]);

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'super_admin',
      action: 'ADMIN_PASSWORD_RESET',
      targetType: 'student',
      targetId: student.id,
      summary: `Issued one-time temporary password reset and revoked active sessions for ${student.student_id}.`,
      ipAddress: ctx.ipAddress,
    });

    res.json({
      studentId: student.student_id,
      temporaryPassword: tempPassword,
      message: 'Temporary password issued. Student must change password on next login.',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Password reset failed.' });
  }
});

adminRouter.delete('/students/:id', requireRoles(['super_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const studentRecordId = req.params.id;
    const admin = getSupabaseAdmin();

    const { data: student } = await admin
      .from('students')
      .select('id, user_id, student_id, full_name')
      .eq('id', studentRecordId)
      .single();

    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    if (student.user_id === ctx.userId) {
      res.status(400).json({ error: 'You cannot delete your own active account.' });
      return;
    }

    const { count: roleCount } = await admin
      .from('admin_roles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', student.user_id);

    if ((roleCount ?? 0) > 0) {
      res.status(400).json({
        error:
          'This student has administrator role records. Revoke privileges or set their student status to Inactive/Withdrawn instead of deleting the account.',
      });
      return;
    }

    const { error: authDelErr } = await admin.auth.admin.deleteUser(student.user_id);
    if (authDelErr) {
      res.status(400).json({ error: authDelErr.message });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'super_admin',
      action: 'STUDENT_DELETED',
      targetType: 'student',
      targetId: student.id,
      summary: `Deleted student account ${student.student_id} (${student.full_name}).`,
      ipAddress: ctx.ipAddress,
    });

    res.json({ ok: true, deletedStudentId: student.student_id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Student deletion failed.' });
  }
});

// ----------------------------------------------------------------------------
// Role Governance (Super Admin Only)
// ----------------------------------------------------------------------------
adminRouter.post('/roles/grant', requireRoles(['super_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { studentId, role, scopeDepartmentId, scopeBatchId, reason } = req.body || {};

    const allowedRoles: AppRole[] = ['super_admin', 'batch_admin', 'moderator'];
    if (!studentId || !allowedRoles.includes(role)) {
      res.status(400).json({ error: 'Valid Student ID and role (super_admin, batch_admin, moderator) are required.' });
      return;
    }

    const admin = getSupabaseAdmin();
    const { data: student } = await admin
      .from('students')
      .select('id, user_id, student_id, full_name, student_status')
      .eq('student_id', String(studentId).trim().toUpperCase())
      .maybeSingle();

    if (!student) {
      res.status(404).json({ error: 'No student found with that Student ID.' });
      return;
    }

    if (student.student_status !== 'active') {
      res.status(400).json({ error: 'Administrator privileges can only be granted to active students.' });
      return;
    }

    const { data: roleRow, error } = await admin
      .from('admin_roles')
      .upsert(
        {
          user_id: student.user_id,
          student_record_id: student.id,
          role,
          scope_department_id: scopeDepartmentId || null,
          scope_batch_id: scopeBatchId || null,
          granted_by: ctx.userId,
          granted_reason: reason ? String(reason).trim() : 'Granted via Super Admin Console',
          is_active: true,
          revoked_at: null,
        },
        { onConflict: 'user_id,role' }
      )
      .select('*')
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'super_admin',
      action: 'ROLE_GRANTED',
      targetType: 'admin_role',
      targetId: roleRow.id,
      summary: `Granted ${role} privilege to ${student.student_id} (${student.full_name}).`,
      metadata: { role, targetStudentId: student.student_id },
      ipAddress: ctx.ipAddress,
    });

    res.json({ adminRole: roleRow });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Role grant failed.' });
  }
});

adminRouter.post('/roles/revoke', requireRoles(['super_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { roleId } = req.body || {};
    if (!roleId) {
      res.status(400).json({ error: 'roleId is required.' });
      return;
    }

    const admin = getSupabaseAdmin();
    const { data: targetRole } = await admin
      .from('admin_roles')
      .select('*, student:students(student_id, full_name)')
      .eq('id', roleId)
      .single();

    if (!targetRole || !targetRole.is_active) {
      res.status(404).json({ error: 'Active role assignment not found.' });
      return;
    }

    if (targetRole.role === 'super_admin') {
      const { count } = await admin
        .from('admin_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .is('revoked_at', null);

      if ((count ?? 0) <= 1) {
        res.status(400).json({ error: 'Cannot revoke the last active Super Admin on the platform.' });
        return;
      }
    }

    const { error } = await admin
      .from('admin_roles')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', roleId);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'super_admin',
      action: 'ROLE_REVOKED',
      targetType: 'admin_role',
      targetId: roleId,
      summary: `Revoked ${targetRole.role} privilege from ${targetRole.student?.student_id || targetRole.user_id}.`,
      ipAddress: ctx.ipAddress,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Role revocation failed.' });
  }
});

// ----------------------------------------------------------------------------
// Session Revocation & Security Settings (Super Admin Only)
// ----------------------------------------------------------------------------
adminRouter.post('/sessions/:id/revoke', requireRoles(['super_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const sessionId = req.params.id;
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from('device_sessions')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_by: ctx.userId,
      })
      .eq('id', sessionId)
      .select('id, user_id')
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'super_admin',
      action: 'SESSION_REVOKED',
      targetType: 'device_session',
      targetId: sessionId,
      summary: `Revoked device session ${sessionId}.`,
      ipAddress: ctx.ipAddress,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Session revocation failed.' });
  }
});

adminRouter.put('/security-settings', requireRoles(['super_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const {
      require_admin_approval,
      enforce_first_login_password_change,
      min_password_length,
      max_devices_per_student,
      session_timeout_hours,
      allow_student_direct_messages,
      maintenance_mode,
    } = req.body || {};

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('security_settings')
      .update({
        require_admin_approval: Boolean(require_admin_approval),
        enforce_first_login_password_change: Boolean(enforce_first_login_password_change),
        min_password_length: Math.min(64, Math.max(8, Number(min_password_length) || 10)),
        max_devices_per_student: Math.min(20, Math.max(1, Number(max_devices_per_student) || 5)),
        session_timeout_hours: Math.min(720, Math.max(1, Number(session_timeout_hours) || 72)),
        allow_student_direct_messages: Boolean(allow_student_direct_messages),
        maintenance_mode: Boolean(maintenance_mode),
        updated_by: ctx.userId,
      })
      .eq('id', 1)
      .select('*')
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'super_admin',
      action: 'SECURITY_SETTINGS_UPDATED',
      targetType: 'security_settings',
      targetId: '1',
      summary: `Updated institutional security policy settings.`,
      metadata: data,
      ipAddress: ctx.ipAddress,
    });

    res.json({ settings: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update security settings.' });
  }
});

adminRouter.post('/audit-log', requireRoles(['super_admin', 'batch_admin', 'moderator']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { action, targetType, targetId, summary, metadata } = req.body || {};
    if (!action || !summary) {
      res.status(400).json({ error: 'action and summary are required.' });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: ctx.isSuperAdmin ? 'super_admin' : ctx.isBatchAdmin ? 'batch_admin' : 'moderator',
      action: String(action),
      targetType: targetType ? String(targetType) : null,
      targetId: targetId ? String(targetId) : null,
      summary: String(summary),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      ipAddress: ctx.ipAddress,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to record audit log.' });
  }
});

// ----------------------------------------------------------------------------
// Cleanup Mismatched Cross-Department Group Memberships
// ----------------------------------------------------------------------------
adminRouter.post('/groups/cleanup-mismatched', requireRoles(['super_admin', 'batch_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const admin = getSupabaseAdmin();

    const [{ data: memberships, error: memErr }, { data: students, error: stuErr }, { data: groups, error: grpErr }] =
      await Promise.all([
        admin.from('group_members').select('id, user_id, group_id'),
        admin.from('students').select('user_id, department_id, course_id, batch_id, student_status'),
        admin.from('groups').select('id, department_id, course_id, batch_id, is_active'),
      ]);

    if (memErr || stuErr || grpErr) {
      res.status(500).json({ error: memErr?.message || stuErr?.message || grpErr?.message });
      return;
    }

    const studentByUserId = new Map(
      (students || []).map((s) => [s.user_id, s])
    );
    const groupById = new Map(
      (groups || []).map((g) => [g.id, g])
    );

    const invalidMembershipIds = (memberships || [])
      .filter((m) => {
        const s = studentByUserId.get(m.user_id);
        const g = groupById.get(m.group_id);
        if (!s || !g) return true;
        if (s.student_status !== 'active' || !g.is_active) return false;
        if (g.department_id && g.department_id !== s.department_id) return true;
        if (g.course_id && g.course_id !== s.course_id) return true;
        if (g.batch_id && g.batch_id !== s.batch_id) return true;
        return false;
      })
      .map((m) => m.id);

    if (invalidMembershipIds.length > 0) {
      const { error: delErr } = await admin.from('group_members').delete().in('id', invalidMembershipIds);
      if (delErr) {
        res.status(400).json({ error: delErr.message });
        return;
      }
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: ctx.isSuperAdmin ? 'super_admin' : 'batch_admin',
      action: 'GROUPS_DEPT_ISOLATION_SYNCED',
      targetType: 'group_members',
      targetId: null,
      summary: `Removed ${invalidMembershipIds.length} cross-department or mismatched group membership(s).`,
      metadata: { removedCount: invalidMembershipIds.length },
      ipAddress: ctx.ipAddress,
    });

    res.json({ removedCount: invalidMembershipIds.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to clean up group memberships.' });
  }
});

// ----------------------------------------------------------------------------
// Admin Group Image Upload & Assignment
// ----------------------------------------------------------------------------
adminRouter.post('/groups/upload-image', requireRoles(['super_admin', 'batch_admin']), async (req, res) => {
  try {
    const { contentType, base64Data, groupId } = req.body || {};
    const allowedTypes: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    const normalizedType = String(contentType || '').toLowerCase();
    const ext = allowedTypes[normalizedType];
    if (!ext) {
      res.status(400).json({ error: 'Only PNG, JPEG, or WebP images are supported.' });
      return;
    }

    const rawBase64 = String(base64Data || '').replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    if (!rawBase64) {
      res.status(400).json({ error: 'Image file data is required.' });
      return;
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'Group image must be under 2 MB.' });
      return;
    }

    const admin = getSupabaseAdmin();

    // Ensure 'avatars' public storage bucket exists
    await admin.storage
      .createBucket('avatars', {
        public: true,
        fileSizeLimit: 2097152,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      })
      .catch(() => {});

    const safeGroupSegment = groupId
      ? String(groupId).replace(/[^a-zA-Z0-9_-]/g, '')
      : 'group';
    const filePath = `groups/${safeGroupSegment}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await admin.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: normalizedType === 'image/jpg' ? 'image/jpeg' : normalizedType,
        upsert: true,
      });

    if (uploadErr) {
      res.status(400).json({ error: uploadErr.message });
      return;
    }

    const { data: urlData } = admin.storage.from('avatars').getPublicUrl(filePath);
    res.json({ publicUrl: urlData.publicUrl });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Group image upload failed.' });
  }
});

adminRouter.patch('/groups/:id/image', requireRoles(['super_admin', 'batch_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const groupId = req.params.id;
    const rawUrl = req.body?.imageUrl;
    const imageUrl = rawUrl ? String(rawUrl).trim() : null;

    if (imageUrl && !/^https?:\/\/.+/i.test(imageUrl)) {
      res.status(400).json({ error: 'Group image URL must start with http:// or https://.' });
      return;
    }

    const admin = getSupabaseAdmin();
    const { data: updated, error } = await admin
      .from('groups')
      .update({ image_url: imageUrl })
      .eq('id', groupId)
      .select('id, name, image_url')
      .single();

    if (error) {
      const msg = error.message || '';
      if (msg.includes('image_url') || msg.includes('schema cache')) {
        res.status(400).json({
          error:
            'Database migration 005_group_images.sql has not been applied yet. Run: ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS image_url TEXT;',
          needsMigration: true,
        });
        return;
      }
      res.status(400).json({ error: msg });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: ctx.isSuperAdmin ? 'super_admin' : 'batch_admin',
      action: 'GROUP_IMAGE_UPDATED',
      targetType: 'group',
      targetId: groupId,
      summary: imageUrl
        ? `Updated image for group "${updated.name}".`
        : `Removed image for group "${updated.name}".`,
      metadata: { imageUrl },
      ipAddress: ctx.ipAddress,
    });

    res.json({ group: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update group image.' });
  }
});

// ----------------------------------------------------------------------------
// Teacher Management (Categorized by Department)
// ----------------------------------------------------------------------------
function isTeachersSchemaMissing(msg: string | undefined | null): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  if (lower.includes('42p01') || lower.includes('pgrst205')) return true;
  if (lower.includes('could not find the table') && lower.includes('teachers')) return true;
  if (lower.includes('relation') && lower.includes('teachers') && lower.includes('does not exist')) return true;
  return false;
}

adminRouter.get('/teachers', requireRoles(['super_admin', 'batch_admin']), async (_req, res) => {
  try {
    const admin = getSupabaseAdmin();
    const [{ data: allDepts, error: deptErr }, { data: teachers, error: teacherErr }] = await Promise.all([
      admin.from('departments').select('*').order('name'),
      admin
        .from('teachers')
        .select('*, department:departments(id, code, name, faculty_area)')
        .order('full_name'),
    ]);

    if (deptErr) {
      res.status(500).json({ error: deptErr.message });
      return;
    }

    const activeDepts = (allDepts || []).filter((d) => d.is_active !== false);
    const deptById = new Map(
      (allDepts || []).map((d) => [
        String(d.id),
        { id: d.id, code: d.code, name: d.name, faculty_area: d.faculty_area },
      ])
    );

    let resolvedTeachers: Record<string, unknown>[] = [];

    if (teacherErr) {
      if (isTeachersSchemaMissing(teacherErr.message)) {
        res.json({
          teachers: [],
          departments: activeDepts,
          schemaReady: false,
        });
        return;
      }

      if (isMissingColumnOrSchemaError(teacherErr.message)) {
        const { data: rawTeachers, error: rawErr } = await admin
          .from('teachers')
          .select('*')
          .order('full_name');
        if (rawErr) {
          if (isTeachersSchemaMissing(rawErr.message)) {
            res.json({ teachers: [], departments: activeDepts, schemaReady: false });
            return;
          }
          res.status(500).json({ error: rawErr.message });
          return;
        }
        resolvedTeachers = (rawTeachers || []).map((row) => {
          const rec = row as Record<string, unknown>;
          return {
            ...rec,
            department: deptById.get(String(rec.department_id)) || null,
          };
        });
      } else {
        res.status(500).json({ error: teacherErr.message });
        return;
      }
    } else {
      resolvedTeachers = (teachers || []) as Record<string, unknown>[];
    }

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
      departments: activeDepts,
      schemaReady: true,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load teachers.' });
  }
});

adminRouter.post('/teachers', requireRoles(['super_admin', 'batch_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const {
      teacherId,
      honorific,
      fullName,
      departmentId,
      designation,
      specialization,
      personalEmail,
      phone,
    } = req.body || {};

    const normalizedId = normalizeStudentId(String(teacherId || ''));
    const trimmedName = String(fullName || '').trim();

    if (normalizedId.length < 4 || !/^[A-Z0-9._-]+$/.test(normalizedId)) {
      res.status(400).json({
        error: 'Teacher ID must be at least 4 characters (letters, numbers, ".", "_", or "-").',
      });
      return;
    }
    if (!trimmedName || !departmentId) {
      res.status(400).json({ error: 'Teacher ID, Full Name, and Department are required.' });
      return;
    }

    const admin = getSupabaseAdmin();

    // Ensure ID does not collide with an existing student or teacher
    const [{ data: existingStudent }, { data: existingTeacher, error: lookupErr }] = await Promise.all([
      admin.from('students').select('id').eq('student_id', normalizedId).maybeSingle(),
      admin.from('teachers').select('id').eq('teacher_id', normalizedId).maybeSingle(),
    ]);

    if (lookupErr) {
      if (isTeachersSchemaMissing(lookupErr.message)) {
        res.status(400).json({
          error:
            'Database migration 006_teacher_portal.sql has not been applied yet. Copy and run the migration SQL in your Supabase SQL Editor first.',
          needsMigration: true,
        });
        return;
      }
      res.status(400).json({ error: lookupErr.message });
      return;
    }

    if (existingStudent || existingTeacher) {
      res.status(409).json({ error: `ID "${normalizedId}" is already assigned to an existing account.` });
      return;
    }

    const tempPassword = generateTemporaryPassword();
    const authEmail = teacherIdToAuthEmail(normalizedId);

    const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        account_type: 'teacher',
        teacher_id: normalizedId,
        full_name: trimmedName,
        must_change_password: true,
      },
    });

    if (authErr || !createdAuth?.user) {
      res.status(400).json({ error: authErr?.message || 'Failed to create teacher auth account.' });
      return;
    }

    const newUserId = createdAuth.user.id;

    const cleanedHonorific = honorific ? String(honorific).trim().slice(0, 24) : null;
    const insertTeacherPayload: Record<string, unknown> = {
      user_id: newUserId,
      teacher_id: normalizedId,
      full_name: trimmedName,
      department_id: departmentId,
      designation: String(designation || 'Assistant Professor').trim() || 'Assistant Professor',
      specialization: specialization ? String(specialization).trim() : null,
      personal_email: personalEmail ? String(personalEmail).trim().toLowerCase() : null,
      phone: phone ? String(phone).trim() : null,
      is_active: true,
      must_change_password: true,
      created_by: ctx.userId,
    };
    if (cleanedHonorific) {
      insertTeacherPayload.honorific = cleanedHonorific;
    }

    let { data: newTeacher, error: insertErr } = await admin
      .from('teachers')
      .insert(insertTeacherPayload)
      .select('*, department:departments(id, code, name, faculty_area)')
      .single();

    if (insertErr && isMissingColumnOrSchemaError(insertErr.message) && 'honorific' in insertTeacherPayload) {
      delete insertTeacherPayload.honorific;
      const retryInsert = await admin
        .from('teachers')
        .insert(insertTeacherPayload)
        .select('*, department:departments(id, code, name, faculty_area)')
        .single();
      newTeacher = retryInsert.data;
      insertErr = retryInsert.error;
      if (!insertErr && newTeacher && cleanedHonorific) {
        const savedMeta = await saveTeacherExtendedMetadata(admin, newUserId, {
          honorific: cleanedHonorific,
        });
        newTeacher = mergeTeacherWithMetadata(newTeacher as Record<string, unknown>, savedMeta);
      }
    }

    if (insertErr || !newTeacher) {
      await admin.auth.admin.deleteUser(newUserId);
      res.status(400).json({ error: insertErr?.message || 'Failed to create teacher record.' });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: ctx.isSuperAdmin ? 'super_admin' : 'batch_admin',
      action: 'TEACHER_CREATED',
      targetType: 'teacher',
      targetId: newTeacher.id,
      summary: `Created teacher account ${normalizedId} (${trimmedName}) in ${newTeacher.department?.name || 'Department'}.`,
      metadata: { teacherId: normalizedId, departmentId },
      ipAddress: ctx.ipAddress,
    });

    res.status(201).json({
      teacher: newTeacher,
      temporaryPassword: tempPassword,
      message: 'Teacher account created. Share the one-time temporary password securely.',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Teacher creation failed.' });
  }
});

adminRouter.patch('/teachers/:id', requireRoles(['super_admin', 'batch_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const teacherRecordId = req.params.id;
    const { honorific, full_name, department_id, designation, specialization, personal_email, phone, is_active } =
      req.body || {};

    const updates: Record<string, unknown> = {};
    if (honorific !== undefined)
      updates.honorific = honorific ? String(honorific).trim().slice(0, 24) : null;
    if (full_name !== undefined) updates.full_name = String(full_name).trim();
    if (department_id !== undefined) updates.department_id = department_id;
    if (designation !== undefined) updates.designation = String(designation).trim() || 'Faculty';
    if (specialization !== undefined)
      updates.specialization = specialization ? String(specialization).trim() : null;
    if (personal_email !== undefined)
      updates.personal_email = personal_email ? String(personal_email).trim().toLowerCase() : null;
    if (phone !== undefined) updates.phone = phone ? String(phone).trim() : null;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    const admin = getSupabaseAdmin();
    let { data: updated, error } = await admin
      .from('teachers')
      .update(updates)
      .eq('id', teacherRecordId)
      .select('*, department:departments(id, code, name, faculty_area)')
      .single();

    if (error && isMissingColumnOrSchemaError(error.message) && 'honorific' in updates) {
      const pendingHonorific = (updates.honorific as string | null) ?? null;
      const fallbackUpdates = { ...updates };
      delete fallbackUpdates.honorific;

      const retryUpdate =
        Object.keys(fallbackUpdates).length > 0
          ? await admin
              .from('teachers')
              .update(fallbackUpdates)
              .eq('id', teacherRecordId)
              .select('*, department:departments(id, code, name, faculty_area)')
              .single()
          : await admin
              .from('teachers')
              .select('*, department:departments(id, code, name, faculty_area)')
              .eq('id', teacherRecordId)
              .single();

      if (!retryUpdate.error && retryUpdate.data) {
        const savedMeta = await saveTeacherExtendedMetadata(
          admin,
          String(retryUpdate.data.user_id),
          { honorific: pendingHonorific }
        );
        updated = mergeTeacherWithMetadata(retryUpdate.data as Record<string, unknown>, savedMeta);
        error = null;
      } else {
        updated = retryUpdate.data;
        error = retryUpdate.error;
      }
    }

    if (error || !updated) {
      res.status(400).json({ error: error?.message || 'Teacher update failed.' });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: ctx.isSuperAdmin ? 'super_admin' : 'batch_admin',
      action: 'TEACHER_UPDATED',
      targetType: 'teacher',
      targetId: String(updated.id),
      summary: `Updated teacher record ${updated.teacher_id} (${Object.keys(updates).join(', ')}).`,
      metadata: updates,
      ipAddress: ctx.ipAddress,
    });

    res.json({ teacher: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Teacher update failed.' });
  }
});

adminRouter.post('/teachers/:id/reset-password', requireRoles(['super_admin', 'batch_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const teacherRecordId = req.params.id;
    const admin = getSupabaseAdmin();

    const { data: teacher } = await admin
      .from('teachers')
      .select('id, user_id, teacher_id')
      .eq('id', teacherRecordId)
      .single();

    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found.' });
      return;
    }

    const tempPassword = generateTemporaryPassword();
    const { error: authErr } = await admin.auth.admin.updateUserById(teacher.user_id, {
      password: tempPassword,
    });

    if (authErr) {
      res.status(400).json({ error: authErr.message });
      return;
    }

    await Promise.all([
      admin.from('teachers').update({ must_change_password: true }).eq('id', teacher.id),
      admin
        .from('device_sessions')
        .update({ is_active: false, revoked_at: new Date().toISOString(), revoked_by: ctx.userId })
        .eq('user_id', teacher.user_id)
        .eq('is_active', true),
    ]);

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: ctx.isSuperAdmin ? 'super_admin' : 'batch_admin',
      action: 'TEACHER_PASSWORD_RESET',
      targetType: 'teacher',
      targetId: teacher.id,
      summary: `Issued one-time temporary password reset and revoked active sessions for teacher ${teacher.teacher_id}.`,
      ipAddress: ctx.ipAddress,
    });

    res.json({
      teacherId: teacher.teacher_id,
      temporaryPassword: tempPassword,
      message: 'Temporary password issued. Teacher must change password on next login.',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Teacher password reset failed.' });
  }
});

adminRouter.delete('/teachers/:id', requireRoles(['super_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const teacherRecordId = req.params.id;
    const admin = getSupabaseAdmin();

    const { data: teacher } = await admin
      .from('teachers')
      .select('id, user_id, teacher_id, full_name')
      .eq('id', teacherRecordId)
      .single();

    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found.' });
      return;
    }

    const { error: authDelErr } = await admin.auth.admin.deleteUser(teacher.user_id);
    if (authDelErr) {
      res.status(400).json({ error: authDelErr.message });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'super_admin',
      action: 'TEACHER_DELETED',
      targetType: 'teacher',
      targetId: teacher.id,
      summary: `Deleted teacher account ${teacher.teacher_id} (${teacher.full_name}).`,
      ipAddress: ctx.ipAddress,
    });

    res.json({ ok: true, deletedTeacherId: teacher.teacher_id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Teacher deletion failed.' });
  }
});

// ----------------------------------------------------------------------------
// Announcement Media Uploads (Notice PDF & Banner Picture)
// ----------------------------------------------------------------------------
adminRouter.post(
  '/announcements/upload-media',
  requireRoles(['super_admin', 'batch_admin']),
  async (req, res) => {
    try {
      const ctx = req.authContext!;
      const { kind, contentType, base64Data, fileName } = req.body || {};

      if (kind !== 'pdf' && kind !== 'banner') {
        res.status(400).json({ error: 'Invalid media kind. Expected "pdf" or "banner".' });
        return;
      }

      const uploaded = await uploadAnnouncementMedia({
        userId: ctx.userId,
        kind: kind as AnnouncementMediaKind,
        contentType: String(contentType || ''),
        base64Data: String(base64Data || ''),
        fileName: fileName ? String(fileName) : undefined,
      });

      res.json(uploaded);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to upload announcement media.',
      });
    }
  }
);

// ----------------------------------------------------------------------------
// Super Admin Customizable Student Tags (e.g. President, CR, Club Lead, etc.)
// ----------------------------------------------------------------------------
adminRouter.patch('/students/:id/tag', requireRoles(['super_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const studentRecordId = req.params.id;
    const { customTag, tagColor } = req.body || {};

    const admin = getSupabaseAdmin();
    const result = await saveStudentCustomTag(admin, studentRecordId, customTag, tagColor);

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'super_admin',
      action: result.customTag ? 'STUDENT_TAG_ASSIGNED' : 'STUDENT_TAG_REMOVED',
      targetType: 'student',
      targetId: result.student.id,
      summary: result.customTag
        ? `Assigned custom tag "${result.customTag}" (${result.tagColor}) to ${result.student.student_id} (${result.student.full_name}).`
        : `Removed custom tag from ${result.student.student_id} (${result.student.full_name}).`,
      metadata: {
        studentId: result.student.student_id,
        customTag: result.customTag,
        tagColor: result.tagColor,
      },
      ipAddress: ctx.ipAddress,
    });

    res.json({
      studentId: result.student.student_id,
      userId: result.student.user_id,
      customTag: result.customTag,
      tagColor: result.tagColor,
      message: result.customTag
        ? `Assigned tag "${result.customTag}" to ${result.student.student_id}.`
        : `Removed custom tag from ${result.student.student_id}.`,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Unable to update student tag.',
    });
  }
});

adminRouter.post('/students/tag-by-id', requireRoles(['super_admin']), async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { studentId, customTag, tagColor } = req.body || {};
    const normalizedId = normalizeStudentId(String(studentId || ''));
    if (!normalizedId) {
      res.status(400).json({ error: 'Student ID is required.' });
      return;
    }

    const admin = getSupabaseAdmin();
    const { data: student, error: stuErr } = await admin
      .from('students')
      .select('id, user_id, student_id, full_name')
      .eq('student_id', normalizedId)
      .maybeSingle();

    if (stuErr || !student) {
      res.status(404).json({ error: `No student found with ID "${normalizedId}".` });
      return;
    }

    const result = await saveStudentCustomTag(admin, student.id, customTag, tagColor);

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'super_admin',
      action: result.customTag ? 'STUDENT_TAG_ASSIGNED' : 'STUDENT_TAG_REMOVED',
      targetType: 'student',
      targetId: result.student.id,
      summary: result.customTag
        ? `Assigned custom tag "${result.customTag}" (${result.tagColor}) to ${result.student.student_id} (${result.student.full_name}).`
        : `Removed custom tag from ${result.student.student_id} (${result.student.full_name}).`,
      metadata: {
        studentId: result.student.student_id,
        customTag: result.customTag,
        tagColor: result.tagColor,
      },
      ipAddress: ctx.ipAddress,
    });

    res.json({
      studentId: result.student.student_id,
      userId: result.student.user_id,
      customTag: result.customTag,
      tagColor: result.tagColor,
      message: result.customTag
        ? `Assigned tag "${result.customTag}" to ${result.student.student_id} (${result.student.full_name}).`
        : `Removed custom tag from ${result.student.student_id}.`,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Unable to assign student tag.',
    });
  }
});

