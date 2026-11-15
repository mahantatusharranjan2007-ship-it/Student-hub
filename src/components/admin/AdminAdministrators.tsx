import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Loader2, ShieldPlus, Tag, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useStudentBadges } from '../../hooks/useStudentBadges';
import { apiRequest } from '../../lib/api';
import { CUSTOM_TAG_PRESETS, TAG_COLOR_THEMES } from '../../lib/studentBadges';
import { getSupabaseClient } from '../../lib/supabase';
import type {
  AdminRoleRecord,
  AdminTierRole,
  AppRole,
  StudentRecord,
  TagColor,
} from '../../types/database';
import { CustomStudentTagBadge, RoleStarBadge } from '../common/PremiumRoleBadge';

type CompactStudentRow = Pick<StudentRecord, 'id' | 'user_id' | 'student_id' | 'full_name'> & {
  department?: { name: string } | null;
  course?: { name: string } | null;
};

export const AdminAdministrators: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const { badgesByUserId, refreshBadges } = useStudentBadges();
  const [roles, setRoles] = useState<AdminRoleRecord[]>([]);
  const [allStudents, setAllStudents] = useState<CompactStudentRow[]>([]);
  const [targetStudentId, setTargetStudentId] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('moderator');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Super Admin Student Tag form state
  const [tagStudentId, setTagStudentId] = useState('');
  const [customTagText, setCustomTagText] = useState('');
  const [tagColor, setTagColor] = useState<TagColor>('gold');
  const [savingTag, setSavingTag] = useState(false);
  const [removingTagId, setRemovingTagId] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const [{ data: roleData }, { data: stuData }] = await Promise.all([
      supabase
        .from('admin_roles')
        .select('*, student:students(id, student_id, full_name, department:departments(name), course:courses(name))')
        .eq('is_active', true)
        .is('revoked_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('students')
        .select('id, user_id, student_id, full_name, department:departments(name), course:courses(name)')
        .order('student_id'),
    ]);
    setRoles((roleData as AdminRoleRecord[]) || []);
    setAllStudents((stuData as unknown as CompactStudentRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest('/api/admin/roles/grant', {
        method: 'POST',
        body: {
          studentId: targetStudentId,
          role: selectedRole,
          reason,
        },
      });
      setSuccess(`Granted ${selectedRole.replace('_', ' ')} privilege to ${targetStudentId.toUpperCase()}.`);
      setTargetStudentId('');
      setReason('');
      await Promise.all([loadRoles(), refreshBadges()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to grant role.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (roleId: string, label: string) => {
    if (!window.confirm(`Revoke ${label} privilege?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await apiRequest('/api/admin/roles/revoke', {
        method: 'POST',
        body: { roleId },
      });
      await Promise.all([loadRoles(), refreshBadges()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke role.');
    }
  };

  const handleAssignTagById = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagStudentId.trim() || !customTagText.trim()) return;
    setSavingTag(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/admin/students/tag-by-id', {
        method: 'POST',
        body: {
          studentId: tagStudentId.trim().toUpperCase(),
          customTag: customTagText.trim(),
          tagColor,
        },
      });
      setSuccess(res.message);
      setTagStudentId('');
      setCustomTagText('');
      await refreshBadges();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to assign student tag.');
    } finally {
      setSavingTag(false);
    }
  };

  const handleRemoveTaggedStudent = async (stu: CompactStudentRow) => {
    setRemovingTagId(stu.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/students/${stu.id}/tag`, {
        method: 'PATCH',
        body: { customTag: null },
      });
      setSuccess(res.message);
      await refreshBadges();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove student tag.');
    } finally {
      setRemovingTagId(null);
    }
  };

  const taggedStudents = useMemo(() => {
    return allStudents
      .map((s) => ({
        student: s,
        badge: badgesByUserId[s.user_id] || null,
      }))
      .filter((item) => Boolean(item.badge?.customTag));
  }, [allStudents, badgesByUserId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administrators &amp; Student Tags</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Privileged roles carry 3-Star (Super Admin), 2-Star (Batch Admin), and 1-Star (Moderator) badges across Directory, Profile, and Messages. Super Admins can also award customizable student tags.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {success}
        </div>
      )}

      {isSuperAdmin && (
        <form
          onSubmit={handleGrant}
          className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-12 dark:border-slate-800 dark:bg-slate-900"
        >
          <input
            type="text"
            required
            placeholder="Student ID (e.g. 5301K24045)"
            value={targetStudentId}
            onChange={(e) => setTargetStudentId(e.target.value.toUpperCase())}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as AppRole)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="moderator">Moderator (1-Star Badge)</option>
            <option value="batch_admin">Batch Admin (2-Star Badge)</option>
            <option value="super_admin">Super Admin (3-Star Badge)</option>
          </select>
          <input
            type="text"
            placeholder="Assignment reason / note"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-4 dark:border-slate-700 dark:bg-slate-950"
          />
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-[42px] whitespace-nowrap items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2 text-xs font-medium text-white hover:bg-teal-800 sm:col-span-2 dark:bg-teal-600"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldPlus className="h-4 w-4" />}
            <span>Grant Role</span>
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-teal-700" />
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Student ID</th>
                <th className="px-4 py-3 font-medium">Name · Department</th>
                <th className="px-4 py-3 font-medium">Badge &amp; Role</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {roles.map((r) => {
                const userBadge = badgesByUserId[r.user_id];
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{r.student?.student_id}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.student?.full_name}</span>
                      <span className="text-slate-500"> · {r.student?.department?.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RoleStarBadge role={r.role as AdminTierRole} compact />
                        {userBadge?.customTag && (
                          <CustomStudentTagBadge
                            tag={userBadge.customTag}
                            color={userBadge.tagColor}
                            compact
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {r.granted_reason || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(r.id, `${r.student?.student_id} (${r.role})`)}
                          className="whitespace-nowrap font-medium text-red-700 hover:underline dark:text-red-400"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Super Admin Customizable Student Tags Section */}
      {isSuperAdmin && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                <Award className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Student Custom Tags (Super Admin)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Assign any customizable tag (e.g. President, Class Representative, Club Lead) to highlight students uniquely across the platform.
                </p>
              </div>
            </div>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {taggedStudents.length} Tagged
            </span>
          </div>

          <form onSubmit={handleAssignTagById} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Student ID
                </label>
                <input
                  type="text"
                  required
                  list="superadmin-student-id-list"
                  placeholder="e.g. 5301K24045"
                  value={tagStudentId}
                  onChange={(e) => setTagStudentId(e.target.value.toUpperCase())}
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                <datalist id="superadmin-student-id-list">
                  {allStudents.map((stu) => (
                    <option key={stu.id} value={stu.student_id}>
                      {stu.full_name}
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Custom Tag (any type, up to 40 chars)
                </label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  placeholder="e.g. President, General Secretary, Fest Lead..."
                  value={customTagText}
                  onChange={(e) => setCustomTagText(e.target.value)}
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Theme Color
                </label>
                <select
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value as TagColor)}
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {Object.values(TAG_COLOR_THEMES).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingTag || !tagStudentId.trim() || !customTagText.trim()}
                  className="inline-flex w-full min-h-[42px] whitespace-nowrap items-center justify-center gap-1.5 rounded-xl bg-violet-700 px-3 py-2 text-xs font-medium text-white hover:bg-violet-800 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-700"
                >
                  {savingTag ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Tag className="h-3.5 w-3.5" />
                  )}
                  <span>Assign Tag</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {CUSTOM_TAG_PRESETS.map((preset) => {
                  const active = customTagText.trim().toLowerCase() === preset.toLowerCase();
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCustomTagText(active ? '' : preset)}
                      className={`whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        active
                          ? 'border-violet-700 bg-violet-700 text-white dark:border-violet-500 dark:bg-violet-600'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>

              {customTagText.trim() && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950">
                  <span className="text-[11px] text-slate-500">Preview:</span>
                  <CustomStudentTagBadge tag={customTagText.trim()} color={tagColor} compact />
                </div>
              )}
            </div>
          </form>

          {taggedStudents.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Student ID</th>
                    <th className="px-4 py-2.5 font-medium">Name · Department</th>
                    <th className="px-4 py-2.5 font-medium">Custom Tag</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {taggedStudents.map(({ student: s, badge }) => (
                    <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {s.student_id}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {s.full_name}
                        </span>
                        <span className="text-slate-500">
                          {s.department?.name ? ` · ${s.department.name}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <CustomStudentTagBadge
                          tag={badge?.customTag}
                          color={badge?.tagColor}
                          compact
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setTagStudentId(s.student_id);
                              setCustomTagText(badge?.customTag || '');
                              setTagColor(badge?.tagColor || 'gold');
                            }}
                            className="whitespace-nowrap font-medium text-teal-700 hover:underline dark:text-teal-400"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={removingTagId === s.id}
                            onClick={() => handleRemoveTaggedStudent(s)}
                            className="inline-flex whitespace-nowrap items-center gap-1 font-medium text-red-700 hover:underline disabled:opacity-50 dark:text-red-400"
                          >
                            {removingTagId === s.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            <span>Remove</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

