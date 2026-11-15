import type { SupabaseClient } from '@supabase/supabase-js';

export interface TeacherExtendedMetadata {
  honorific?: string | null;
  qualification?: string | null;
  experience_years?: number | null;
  subjects_taught?: string[];
  research_areas?: string[];
  office_location?: string | null;
  office_hours?: string | null;
  bio?: string | null;
  website_url?: string | null;
  publications_summary?: string | null;
  profile_completed?: boolean;
  profile_updated_at?: string | null;
}

export function isMissingColumnOrSchemaError(message: string | undefined | null): boolean {
  const lower = (message || '').toLowerCase();
  return (
    lower.includes('schema cache') ||
    lower.includes('pgrst204') ||
    lower.includes('42703') ||
    lower.includes('does not exist') ||
    lower.includes('could not find') ||
    lower.includes('column')
  );
}

export function hasTeacher007Columns(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  return 'qualification' in row && 'profile_completed' in row;
}

export function hasTeacher009Column(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  return 'honorific' in row;
}

export function mergeTeacherWithMetadata<T extends Record<string, unknown>>(
  row: T,
  userMetadata?: Record<string, unknown> | null
): T {
  const metaProfile = (
    userMetadata &&
    typeof userMetadata === 'object' &&
    userMetadata.teacher_professional_profile &&
    typeof userMetadata.teacher_professional_profile === 'object'
      ? userMetadata.teacher_professional_profile
      : null
  ) as TeacherExtendedMetadata | null;

  const merged: Record<string, unknown> = { ...row };
  const has007 = hasTeacher007Columns(row);
  const has009 = hasTeacher009Column(row);
  const dbProfileCompleted = Boolean(row.profile_completed);

  if (!has009) {
    merged.honorific = metaProfile?.honorific ?? null;
  } else if (merged.honorific == null && !dbProfileCompleted && metaProfile?.honorific) {
    merged.honorific = metaProfile.honorific;
  } else if (merged.honorific === undefined) {
    merged.honorific = null;
  }

  if (!has007 || (!dbProfileCompleted && metaProfile?.profile_completed)) {
    merged.qualification = metaProfile?.qualification ?? row.qualification ?? null;
    merged.experience_years = metaProfile?.experience_years ?? row.experience_years ?? null;
    merged.subjects_taught = Array.isArray(metaProfile?.subjects_taught)
      ? metaProfile!.subjects_taught
      : Array.isArray(row.subjects_taught)
        ? row.subjects_taught
        : [];
    merged.research_areas = Array.isArray(metaProfile?.research_areas)
      ? metaProfile!.research_areas
      : Array.isArray(row.research_areas)
        ? row.research_areas
        : [];
    merged.office_location = metaProfile?.office_location ?? row.office_location ?? null;
    merged.office_hours = metaProfile?.office_hours ?? row.office_hours ?? null;
    merged.bio = metaProfile?.bio ?? row.bio ?? null;
    merged.website_url = metaProfile?.website_url ?? row.website_url ?? null;
    merged.publications_summary =
      metaProfile?.publications_summary ?? row.publications_summary ?? null;
    merged.profile_completed = Boolean(metaProfile?.profile_completed || row.profile_completed);
    merged.profile_updated_at = metaProfile?.profile_updated_at ?? row.profile_updated_at ?? null;
  }

  return merged as T;
}

export async function saveTeacherExtendedMetadata(
  admin: SupabaseClient,
  userId: string,
  profile: TeacherExtendedMetadata,
  existingUserMetadata?: Record<string, unknown> | null
): Promise<Record<string, unknown>> {
  let baseMeta = existingUserMetadata;
  if (!baseMeta) {
    const { data } = await admin.auth.admin.getUserById(userId);
    baseMeta = (data?.user?.user_metadata as Record<string, unknown>) || {};
  }

  const prevProfile =
    baseMeta.teacher_professional_profile && typeof baseMeta.teacher_professional_profile === 'object'
      ? (baseMeta.teacher_professional_profile as Record<string, unknown>)
      : {};

  const nextUserMetadata: Record<string, unknown> = {
    ...baseMeta,
    teacher_professional_profile: {
      ...prevProfile,
      ...profile,
    },
  };

  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: nextUserMetadata,
  });

  if (error) {
    throw new Error(error.message || 'Unable to save extended teacher profile metadata.');
  }

  return nextUserMetadata;
}

export async function fetchTeacherMetadataMap(
  admin: SupabaseClient
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const user of data?.users || []) {
      if (user?.id && user?.user_metadata && typeof user.user_metadata === 'object') {
        map.set(user.id, user.user_metadata as Record<string, unknown>);
      }
    }
  } catch {
    // Non-fatal fallback
  }
  return map;
}
