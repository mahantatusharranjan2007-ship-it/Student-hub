import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchTeacherMetadataMap,
  isMissingColumnOrSchemaError,
} from './teacherProfileCompat.ts';

export type AdminTierRole = 'super_admin' | 'batch_admin' | 'moderator';
export type TagColor = 'gold' | 'violet' | 'teal' | 'indigo' | 'rose';

export interface StudentBadgeInfo {
  userId: string;
  studentRecordId: string;
  highestAdminRole: AdminTierRole | null;
  starCount: 0 | 1 | 2 | 3;
  customTag: string | null;
  tagColor: TagColor;
}

const VALID_TAG_COLORS = new Set<TagColor>(['gold', 'violet', 'teal', 'indigo', 'rose']);

export function normalizeTagColor(value: unknown): TagColor {
  const lower = String(value || 'gold').trim().toLowerCase() as TagColor;
  return VALID_TAG_COLORS.has(lower) ? lower : 'gold';
}

export function normalizeCustomTag(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).replace(/\s+/g, ' ').trim().slice(0, 40);
  return trimmed.length > 0 ? trimmed : null;
}

export function getStarCountForRole(role: AdminTierRole | null): 0 | 1 | 2 | 3 {
  if (role === 'super_admin') return 3;
  if (role === 'batch_admin') return 2;
  if (role === 'moderator') return 1;
  return 0;
}

function pickHigherRole(
  current: AdminTierRole | null,
  candidate: string
): AdminTierRole | null {
  const rank: Record<AdminTierRole, number> = {
    super_admin: 3,
    batch_admin: 2,
    moderator: 1,
  };
  if (
    candidate !== 'super_admin' &&
    candidate !== 'batch_admin' &&
    candidate !== 'moderator'
  ) {
    return current;
  }
  if (!current) return candidate;
  return rank[candidate] > rank[current] ? candidate : current;
}

export async function loadStudentBadgesMap(
  admin: SupabaseClient
): Promise<Record<string, StudentBadgeInfo>> {
  const [{ data: roleRows }, studentsRes] = await Promise.all([
    admin
      .from('admin_roles')
      .select('user_id, role')
      .eq('is_active', true)
      .is('revoked_at', null),
    admin.from('students').select('id, user_id, custom_tag, tag_color'),
  ]);

  let studentRows = (studentsRes.data || []) as Array<{
    id: string;
    user_id: string;
    custom_tag?: string | null;
    tag_color?: string | null;
  }>;
  let hasTagColumns = !studentsRes.error;

  if (studentsRes.error && isMissingColumnOrSchemaError(studentsRes.error.message)) {
    hasTagColumns = false;
    const fallbackRes = await admin.from('students').select('id, user_id');
    studentRows = (fallbackRes.data || []) as Array<{ id: string; user_id: string }>;
  }

  const highestRoleByUser = new Map<string, AdminTierRole>();
  for (const row of roleRows || []) {
    const uid = String(row.user_id || '');
    if (!uid) continue;
    const prev = highestRoleByUser.get(uid) || null;
    const next = pickHigherRole(prev, String(row.role || ''));
    if (next) highestRoleByUser.set(uid, next);
  }

  let userMetaMap: Map<string, Record<string, unknown>> | null = null;
  if (!hasTagColumns) {
    userMetaMap = await fetchTeacherMetadataMap(admin);
  }

  const badges: Record<string, StudentBadgeInfo> = {};

  for (const stu of studentRows) {
    const uid = String(stu.user_id || '');
    if (!uid) continue;

    const highestAdminRole = highestRoleByUser.get(uid) || null;
    const starCount = getStarCountForRole(highestAdminRole);

    let customTag: string | null = null;
    let tagColor: TagColor = 'gold';

    if (hasTagColumns) {
      customTag = normalizeCustomTag(stu.custom_tag);
      tagColor = normalizeTagColor(stu.tag_color);
    } else if (userMetaMap) {
      const meta = userMetaMap.get(uid);
      const tagObj =
        meta &&
        typeof meta.student_custom_tag === 'object' &&
        meta.student_custom_tag !== null
          ? (meta.student_custom_tag as { custom_tag?: unknown; tag_color?: unknown })
          : null;
      if (tagObj) {
        customTag = normalizeCustomTag(tagObj.custom_tag);
        tagColor = normalizeTagColor(tagObj.tag_color);
      }
    }

    if (highestAdminRole || customTag) {
      badges[uid] = {
        userId: uid,
        studentRecordId: stu.id,
        highestAdminRole,
        starCount,
        customTag,
        tagColor,
      };
    }
  }

  return badges;
}

export async function saveStudentCustomTag(
  admin: SupabaseClient,
  studentRecordId: string,
  rawTag: unknown,
  rawColor: unknown
): Promise<{
  student: { id: string; user_id: string; student_id: string; full_name: string };
  customTag: string | null;
  tagColor: TagColor;
}> {
  const customTag = normalizeCustomTag(rawTag);
  const tagColor = normalizeTagColor(rawColor);

  const { data: stu, error: lookupErr } = await admin
    .from('students')
    .select('id, user_id, student_id, full_name')
    .eq('id', studentRecordId)
    .maybeSingle();

  if (lookupErr || !stu) {
    throw new Error('Student record not found.');
  }

  // Persist to public.students if migration 010 is applied
  const { error: updateErr } = await admin
    .from('students')
    .update({
      custom_tag: customTag,
      tag_color: customTag ? tagColor : null,
    })
    .eq('id', studentRecordId);

  if (updateErr && !isMissingColumnOrSchemaError(updateErr.message)) {
    throw new Error(updateErr.message);
  }

  // Always mirror into auth user_metadata so it works seamlessly even before migration 010 is run
  const { data: authData } = await admin.auth.admin.getUserById(stu.user_id);
  const baseMeta = (authData?.user?.user_metadata as Record<string, unknown>) || {};
  const nextMeta: Record<string, unknown> = {
    ...baseMeta,
    student_custom_tag: {
      custom_tag: customTag,
      tag_color: customTag ? tagColor : null,
      updated_at: new Date().toISOString(),
    },
  };

  const { error: metaErr } = await admin.auth.admin.updateUserById(stu.user_id, {
    user_metadata: nextMeta,
  });

  if (metaErr && updateErr) {
    throw new Error(metaErr.message || 'Unable to save student tag.');
  }

  return {
    student: stu,
    customTag,
    tagColor,
  };
}
