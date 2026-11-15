import React, { useCallback, useEffect, useState } from 'react';
import { Award, Check, Copy, KeyRound, Loader2, Search, Tag, Trash2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useStudentBadges } from '../../hooks/useStudentBadges';
import { apiRequest } from '../../lib/api';
import {
  CUSTOM_TAG_PRESETS,
  getUniqueRowAccentClass,
  ROLE_TIER_SPECS,
  TAG_COLOR_THEMES,
} from '../../lib/studentBadges';
import { getSupabaseClient } from '../../lib/supabase';
import type {
  AcademicStatus,
  Batch,
  Course,
  Department,
  StudentRecord,
  StudentStatus,
  TagColor,
  VerificationStatus,
} from '../../types/database';
import { CustomStudentTagBadge, StudentBadgesLine } from '../common/PremiumRoleBadge';

export const AdminStudents: React.FC = () => {
  const { isSuperAdmin, student: currentStudent } = useAuth();
  const { getBadgeForUser, refreshBadges } = useStudentBadges();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'badged'>('all');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StudentRecord | null>(null);
  const [saving, setSaving] = useState(false);

  // Super Admin custom tag editor state
  const [taggingStudent, setTaggingStudent] = useState<StudentRecord | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tagColor, setTagColor] = useState<TagColor>('gold');
  const [savingTag, setSavingTag] = useState(false);

  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ studentId: string; tempPass: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const [{ data: stuData }, { data: deptData }, { data: courseData }, { data: batchData }] =
      await Promise.all([
        supabase
          .from('students')
          .select(
            '*, department:departments(id, name, code), course:courses(id, name, code), batch:batches(id, name)'
          )
          .order('student_id'),
        supabase.from('departments').select('*').order('name'),
        supabase.from('courses').select('*').order('name'),
        supabase.from('batches').select('*').order('admission_year', { ascending: false }),
      ]);

    setStudents((stuData as StudentRecord[]) || []);
    setDepartments((deptData as Department[]) || []);
    setCourses((courseData as Course[]) || []);
    setBatches((batchData as Batch[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openTagEditor = (stu: StudentRecord) => {
    const existing = getBadgeForUser(stu.user_id);
    setEditing(null);
    setConfirmResetId(null);
    setConfirmDeleteId(null);
    setError(null);
    setTaggingStudent(stu);
    setTagInput(existing?.customTag || '');
    setTagColor(existing?.tagColor || 'gold');
  };

  const handleSaveTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taggingStudent) return;
    setSavingTag(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const cleanedTag = tagInput.trim();
      const res = await apiRequest<{ message: string }>(
        `/api/admin/students/${taggingStudent.id}/tag`,
        {
          method: 'PATCH',
          body: {
            customTag: cleanedTag || null,
            tagColor,
          },
        }
      );
      setSuccessMessage(res.message);
      setTaggingStudent(null);
      await refreshBadges();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save student tag.');
    } finally {
      setSavingTag(false);
    }
  };

  const handleRemoveTag = async () => {
    if (!taggingStudent) return;
    setSavingTag(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/students/${taggingStudent.id}/tag`,
        {
          method: 'PATCH',
          body: {
            customTag: null,
            tagColor,
          },
        }
      );
      setSuccessMessage(res.message);
      setTaggingStudent(null);
      await refreshBadges();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove student tag.');
    } finally {
      setSavingTag(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/students/${editing.id}`, {
        method: 'PATCH',
        body: {
          full_name: editing.full_name,
          department_id: editing.department_id,
          course_id: editing.course_id,
          batch_id: editing.batch_id,
          semester: editing.semester,
          roll_number: editing.roll_number,
          student_status: editing.student_status,
          academic_status: editing.academic_status,
          verification_status: editing.verification_status,
        },
      });
      setEditing(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Student update failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (stu: StudentRecord) => {
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await apiRequest<{ studentId: string; temporaryPassword: string }>(
        `/api/admin/students/${stu.id}/reset-password`,
        { method: 'POST' }
      );
      setResetResult({ studentId: res.studentId, tempPass: res.temporaryPassword });
      setConfirmResetId(null);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    }
  };

  const handleDeleteStudent = async (stu: StudentRecord) => {
    setDeletingId(stu.id);
    setError(null);
    setSuccessMessage(null);
    try {
      await apiRequest(`/api/admin/students/${stu.id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      if (editing?.id === stu.id) setEditing(null);
      if (taggingStudent?.id === stu.id) setTaggingStudent(null);
      setSuccessMessage(`Deleted student account ${stu.student_id} (${stu.full_name}).`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Student deletion failed.');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = students.filter((s) => {
    const badge = getBadgeForUser(s.user_id);
    if (filterMode === 'badged' && !badge?.highestAdminRole && !badge?.customTag) {
      return false;
    }
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const roleLabel = badge?.highestAdminRole
      ? ROLE_TIER_SPECS[badge.highestAdminRole].label.toLowerCase()
      : '';
    return (
      s.student_id.toLowerCase().includes(q) ||
      s.full_name.toLowerCase().includes(q) ||
      (s.department?.name || '').toLowerCase().includes(q) ||
      (badge?.customTag || '').toLowerCase().includes(q) ||
      roleLabel.includes(q)
    );
  });

  const existingTagForModal = taggingStudent ? getBadgeForUser(taggingStudent.user_id)?.customTag : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Students</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Manage enrollment records, academic statuses, custom campus tags, and credential resets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                filterMode === 'all'
                  ? 'bg-teal-700 text-white dark:bg-teal-600'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              All ({students.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('badged')}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                filterMode === 'badged'
                  ? 'bg-teal-700 text-white dark:bg-teal-600'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              Admins & Tagged
            </button>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Filter ID, name, or tag..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {successMessage}
        </div>
      )}

      {resetResult && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                One-Time Reset Password for {resetResult.studentId}
              </p>
              <p className="mt-1 font-mono text-sm font-bold">{resetResult.tempPass}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(resetResult.tempPass);
                  setCopied(true);
                }}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() => setResetResult(null)}
                className="text-xs font-medium text-amber-900 underline dark:text-amber-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Custom Student Tag Editor */}
      {isSuperAdmin && taggingStudent && (
        <form
          onSubmit={handleSaveTag}
          className="space-y-4 rounded-2xl border border-violet-200 bg-white p-6 dark:border-violet-800/60 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                <Award className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Customize Tag · {taggingStudent.full_name}{' '}
                  <span className="font-mono text-xs text-slate-500">
                    ({taggingStudent.student_id})
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Assign any preset or custom campus title. Highlighted across Directory, Profile, and Messages.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTaggingStudent(null)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              <span>Close</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Custom Tag Label (any text up to 40 chars)
              </label>
              <input
                type="text"
                maxLength={40}
                placeholder="e.g. President, CR, Fest Coordinator, Chess Captain..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {CUSTOM_TAG_PRESETS.map((preset) => {
                  const active = tagInput.trim().toLowerCase() === preset.toLowerCase();
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTagInput(active ? '' : preset)}
                      className={`whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        active
                          ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-600'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-6 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Visual Theme
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {Object.values(TAG_COLOR_THEMES).map((theme) => {
                    const selected = tagColor === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setTagColor(theme.id)}
                        className={`inline-flex whitespace-nowrap items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${theme.swatchClass}`} />
                        <span>{theme.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Live Badge Preview
                </p>
                <div className="mt-1.5 flex min-h-[28px] items-center gap-2">
                  {tagInput.trim() ? (
                    <CustomStudentTagBadge tag={tagInput.trim()} color={tagColor} />
                  ) : (
                    <span className="text-xs italic text-slate-400">
                      Type a custom tag or click a preset above
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingTag || !tagInput.trim()}
                className="inline-flex min-h-[40px] whitespace-nowrap items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-700"
              >
                {savingTag && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <Tag className="h-3.5 w-3.5" />
                <span>Save Custom Tag</span>
              </button>
              {existingTagForModal && (
                <button
                  type="button"
                  disabled={savingTag}
                  onClick={handleRemoveTag}
                  className="inline-flex min-h-[40px] whitespace-nowrap items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove Tag</span>
                </button>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              {tagInput.trim().length}/40 characters
            </span>
          </div>
        </form>
      )}

      {/* Edit Modal */}
      {editing && (
        <form
          onSubmit={handleSaveEdit}
          className="space-y-4 rounded-2xl border border-teal-200 bg-white p-6 dark:border-teal-900 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              Edit Student <span className="font-mono">{editing.student_id}</span>
            </h2>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium">Full Name</label>
              <input
                type="text"
                required
                value={editing.full_name}
                onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Department</label>
              <select
                value={editing.department_id}
                onChange={(e) => setEditing({ ...editing, department_id: e.target.value })}
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">Course</label>
              <select
                value={editing.course_id}
                onChange={(e) => setEditing({ ...editing, course_id: e.target.value })}
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">Batch</label>
              <select
                value={editing.batch_id || ''}
                onChange={(e) => setEditing({ ...editing, batch_id: e.target.value || null })}
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">Unassigned</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">Student Status</label>
              <select
                value={editing.student_status}
                onChange={(e) => setEditing({ ...editing, student_status: e.target.value as StudentStatus })}
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
                <option value="alumni">Alumni</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">Academic Status</label>
              <select
                value={editing.academic_status}
                onChange={(e) =>
                  setEditing({ ...editing, academic_status: e.target.value as AcademicStatus })
                }
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="studying">Studying</option>
                <option value="graduated">Graduated</option>
                <option value="on_leave">On Leave</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">Verification Status</label>
              <select
                value={editing.verification_status}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    verification_status: e.target.value as VerificationStatus,
                  })
                }
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="provisioned_unverified">Provisioned (Unverified)</option>
                <option value="pending_review">Pending Review</option>
                <option value="verified">Verified</option>
                <option value="flagged">Flagged</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">Semester</label>
              <input
                type="number"
                min={1}
                max={12}
                value={editing.semester}
                onChange={(e) => setEditing({ ...editing, semester: Number(e.target.value) })}
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Save Student Record</span>
          </button>
        </form>
      )}

      {/* Students Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-teal-700" />
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-4 py-3 font-medium">Student ID</th>
                <th className="px-4 py-3 font-medium">Name &amp; Badges</th>
                <th className="px-4 py-3 font-medium">Department · Course</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Verification</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((s) => {
                const badge = getBadgeForUser(s.user_id);
                const rowAccent = getUniqueRowAccentClass(badge);
                return (
                  <tr
                    key={s.id}
                    className={`${rowAccent} hover:bg-slate-50/70 dark:hover:bg-slate-800/40`}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {s.student_id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {s.full_name}
                      </div>
                      <StudentBadgesLine badge={badge} compact className="mt-1" />
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {s.department?.name} · {s.course?.name}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span
                        className={
                          s.student_status === 'active'
                            ? 'font-medium text-emerald-700 dark:text-emerald-400'
                            : s.student_status === 'suspended'
                            ? 'font-medium text-red-700 dark:text-red-400'
                            : 'text-slate-500'
                        }
                      >
                        {s.student_status}
                      </span>
                      <span className="text-slate-400"> · {s.academic_status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-400">
                      {s.verification_status.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setTaggingStudent(null);
                            setEditing(s);
                          }}
                          className="min-h-[36px] whitespace-nowrap font-medium text-teal-700 hover:underline dark:text-teal-400"
                        >
                          Edit
                        </button>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => openTagEditor(s)}
                            className="inline-flex min-h-[36px] whitespace-nowrap items-center gap-1 font-medium text-violet-700 hover:underline dark:text-violet-400"
                          >
                            <Tag className="h-3 w-3" />
                            <span>{badge?.customTag ? 'Edit Tag' : 'Add Tag'}</span>
                          </button>
                        )}
                        {isSuperAdmin &&
                          (confirmResetId === s.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleResetPassword(s)}
                                className="min-h-[30px] whitespace-nowrap rounded-lg bg-amber-700 px-2 py-1 text-xs font-medium text-white hover:bg-amber-800"
                              >
                                Confirm Reset
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmResetId(null)}
                                className="min-h-[30px] px-1 text-xs text-slate-600 dark:text-slate-400"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                setConfirmResetId(s.id);
                              }}
                              className="inline-flex min-h-[36px] whitespace-nowrap items-center gap-1 font-medium text-amber-700 hover:underline dark:text-amber-400"
                            >
                              <KeyRound className="h-3 w-3" />
                              <span>Reset PW</span>
                            </button>
                          ))}
                        {isSuperAdmin &&
                          s.id !== currentStudent?.id &&
                          (confirmDeleteId === s.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deletingId === s.id}
                                onClick={() => handleDeleteStudent(s)}
                                className="inline-flex min-h-[30px] whitespace-nowrap items-center gap-1 rounded-lg bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
                              >
                                {deletingId === s.id && <Loader2 className="h-3 w-3 animate-spin" />}
                                <span>Confirm Delete</span>
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === s.id}
                                onClick={() => setConfirmDeleteId(null)}
                                className="min-h-[30px] px-1 text-xs text-slate-600 dark:text-slate-400"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmResetId(null);
                                setConfirmDeleteId(s.id);
                              }}
                              className="inline-flex min-h-[36px] whitespace-nowrap items-center gap-1 font-medium text-red-700 hover:underline dark:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

