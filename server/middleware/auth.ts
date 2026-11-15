import type { NextFunction, Request, Response } from 'express';
import { getSupabaseAdmin, type AppRole } from '../supabaseAdmin.ts';
import { mergeTeacherWithMetadata } from '../services/teacherProfileCompat.ts';

export interface AuthContext {
  userId: string;
  accountType: 'student' | 'teacher';
  studentRecordId: string;
  teacherRecordId?: string;
  departmentId?: string;
  studentId: string;
  fullName: string;
  studentStatus: string;
  mustChangePassword: boolean;
  roles: AppRole[];
  isSuperAdmin: boolean;
  isBatchAdmin: boolean;
  isModerator: boolean;
  isTeacher: boolean;
  ipAddress: string;
  accessToken: string;
}

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication token is required.' });
      return;
    }

    const admin = getSupabaseAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const userId = userData.user.id;
    const [{ data: student }, { data: profile }, { data: roleRows }, teacherRes] = await Promise.all([
      admin
        .from('students')
        .select('id, student_id, full_name, department_id, student_status')
        .eq('user_id', userId)
        .maybeSingle(),
      admin
        .from('profiles')
        .select('must_change_password')
        .eq('id', userId)
        .maybeSingle(),
      admin
        .from('admin_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('is_active', true)
        .is('revoked_at', null),
      admin
        .from('teachers')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (student) {
      if (student.student_status === 'suspended') {
        res.status(403).json({ error: 'This student account is currently suspended.' });
        return;
      }

      const adminRoles = (roleRows || []).map((r) => r.role as AppRole);
      const roles: AppRole[] = adminRoles.length > 0 ? [...adminRoles, 'student'] : ['student'];

      req.authContext = {
        userId,
        accountType: 'student',
        studentRecordId: student.id,
        departmentId: student.department_id,
        studentId: student.student_id,
        fullName: student.full_name,
        studentStatus: student.student_status,
        mustChangePassword: profile?.must_change_password ?? false,
        roles,
        isSuperAdmin: adminRoles.includes('super_admin'),
        isBatchAdmin: adminRoles.includes('batch_admin'),
        isModerator: adminRoles.includes('moderator'),
        isTeacher: false,
        ipAddress: extractClientIp(req),
        accessToken: token,
      };

      next();
      return;
    }

    const rawTeacher = teacherRes?.error ? null : teacherRes?.data;
    if (rawTeacher) {
      if (!rawTeacher.is_active) {
        res.status(403).json({ error: 'This teacher account is currently inactive.' });
        return;
      }

      const teacher = mergeTeacherWithMetadata(
        rawTeacher as Record<string, unknown>,
        (userData.user.user_metadata as Record<string, unknown>) || null
      );

      const rawName = String(teacher.full_name || '').trim();
      const prefix = String(teacher.honorific || '').trim();
      const formattedName =
        prefix && rawName && !rawName.toLowerCase().startsWith(`${prefix.toLowerCase()} `)
          ? `${prefix} ${rawName}`
          : rawName;

      req.authContext = {
        userId,
        accountType: 'teacher',
        studentRecordId: String(teacher.id),
        teacherRecordId: String(teacher.id),
        departmentId: teacher.department_id ? String(teacher.department_id) : undefined,
        studentId: String(teacher.teacher_id),
        fullName: formattedName,
        studentStatus: 'active',
        mustChangePassword: Boolean(teacher.must_change_password),
        roles: ['teacher'],
        isSuperAdmin: false,
        isBatchAdmin: false,
        isModerator: false,
        isTeacher: true,
        ipAddress: extractClientIp(req),
        accessToken: token,
      };

      next();
      return;
    }

    res.status(403).json({ error: 'No student or teacher account is linked to this session.' });
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication verification failed.' });
  }
}

export function requireRoles(allowed: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.authContext;
    if (!ctx) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (ctx.mustChangePassword) {
      res.status(403).json({ error: 'Password change required before accessing privileged actions.' });
      return;
    }
    const permitted = allowed.some((role) => ctx.roles.includes(role));
    if (!permitted) {
      res.status(403).json({ error: 'Insufficient role privileges for this operation.' });
      return;
    }
    next();
  };
}

export function requireTeacher(req: Request, res: Response, next: NextFunction): void {
  const ctx = req.authContext;
  if (!ctx) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (!ctx.isTeacher || ctx.accountType !== 'teacher') {
    res.status(403).json({ error: 'Teacher faculty access required.' });
    return;
  }
  if (ctx.mustChangePassword) {
    res.status(403).json({ error: 'Password change required before accessing the Teacher Portal.' });
    return;
  }
  next();
}
