import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AppRole = 'super_admin' | 'batch_admin' | 'moderator' | 'teacher' | 'student';

let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
}

export function getSupabaseAnonKey(): string {
  return (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
}

export function getSupabaseServiceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export function isValidHttpUrl(value: string): boolean {
  if (!value || value.includes('your-project-ref') || value.startsWith('MY_') || value.startsWith('SET_')) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSupabasePublicConfigured(): boolean {
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  return Boolean(
    isValidHttpUrl(url) &&
      anon &&
      !anon.includes('your-supabase-anon-key') &&
      !anon.startsWith('MY_') &&
      !anon.startsWith('SET_')
  );
}

export function isSupabaseAdminConfigured(): boolean {
  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();
  return Boolean(
    isValidHttpUrl(url) &&
      serviceKey &&
      !serviceKey.includes('your-supabase-service-role-key') &&
      !serviceKey.startsWith('MY_') &&
      !serviceKey.startsWith('SET_')
  );
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseAdminConfigured()) {
    throw new Error('Supabase server credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured.');
  }
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return cachedAdminClient;
}

export function createSupabaseAnonClient(): SupabaseClient {
  if (!isSupabasePublicConfigured()) {
    throw new Error('Supabase public credentials (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are not configured.');
  }
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function normalizeStudentId(studentId: string): string {
  return studentId.trim().toUpperCase();
}

export function studentIdToAuthEmail(studentId: string): string {
  const normalized = normalizeStudentId(studentId).toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${normalized}@studenthub.ddu.internal`;
}

export function teacherIdToAuthEmail(teacherId: string): string {
  const normalized = normalizeStudentId(teacherId).toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${normalized}@faculty.ddu.internal`;
}

export async function writeAuditLog(params: {
  actorUserId?: string | null;
  actorStudentId?: string | null;
  actorRole: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  try {
    const admin = getSupabaseAdmin();
    await admin.from('admin_audit_logs').insert({
      actor_user_id: params.actorUserId ?? null,
      actor_student_id: params.actorStudentId ?? null,
      actor_role: params.actorRole,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      summary: params.summary,
      metadata: params.metadata ?? {},
      ip_address: params.ipAddress ?? null,
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
