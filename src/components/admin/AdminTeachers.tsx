import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  Edit3,
  GraduationCap,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import { formatTeacherName, TEACHER_HONORIFIC_PRESETS } from '../../lib/teacherDisplay';
import type { Department, TeacherRecord } from '../../types/database';

export const AdminTeachers: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schemaReady, setSchemaReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Migration copy helper if 006 is not applied yet
  const [copyingSql, setCopyingSql] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);

  // Create form
  const [teacherId, setTeacherId] = useState('');
  const [honorific, setHonorific] = useState('');
  const [fullName, setFullName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [designation, setDesignation] = useState('Assistant Professor');
  const [specialization, setSpecialization] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);

  // One-time credential alert
  const [issuedCredential, setIssuedCredential] = useState<{
    teacherId: string;
    password: string;
  } | null>(null);
  const [copiedPw, setCopiedPw] = useState(false);

  // Filter & edit state
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TeacherRecord>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        teachers: TeacherRecord[];
        departments: Department[];
        schemaReady: boolean;
      }>('/api/admin/teachers');
      setTeachers(res.teachers || []);
      setDepartments(res.departments || []);
      setSchemaReady(res.schemaReady !== false);
      if (res.departments?.length > 0 && !departmentId) {
        setDepartmentId(res.departments[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load teachers.');
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const handleCopySql = async () => {
    setCopyingSql(true);
    try {
      const data = await apiRequest<{ sql: string }>('/api/setup/migration-sql', {
        authenticated: false,
      });
      await navigator.clipboard.writeText(data.sql);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy migration SQL.');
    } finally {
      setCopyingSql(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setIssuedCredential(null);
    try {
      const res = await apiRequest<{
        teacher: TeacherRecord;
        temporaryPassword: string;
      }>('/api/admin/teachers', {
        method: 'POST',
        body: {
          teacherId: teacherId.trim().toUpperCase(),
          honorific: honorific.trim() || null,
          fullName: fullName.trim(),
          departmentId,
          designation: designation.trim(),
          specialization: specialization.trim() || null,
          personalEmail: personalEmail.trim() || null,
          phone: phone.trim() || null,
        },
      });
      setIssuedCredential({
        teacherId: res.teacher.teacher_id,
        password: res.temporaryPassword,
      });
      setTeacherId('');
      setHonorific('');
      setFullName('');
      setSpecialization('');
      setPersonalEmail('');
      setPhone('');
      await loadTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create teacher.');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    setSavingId(id);
    setError(null);
    try {
      await apiRequest(`/api/admin/teachers/${id}`, {
        method: 'PATCH',
        body: editDraft,
      });
      setEditingId(null);
      await loadTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update teacher.');
    } finally {
      setSavingId(null);
    }
  };

  const handleResetPassword = async (t: TeacherRecord) => {
    setResettingId(t.id);
    setError(null);
    setIssuedCredential(null);
    try {
      const res = await apiRequest<{
        teacherId: string;
        temporaryPassword: string;
      }>(`/api/admin/teachers/${t.id}/reset-password`, { method: 'POST' });
      setConfirmResetId(null);
      setIssuedCredential({
        teacherId: res.teacherId,
        password: res.temporaryPassword,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset teacher password.');
    } finally {
      setResettingId(null);
    }
  };

  const handleDelete = async (t: TeacherRecord) => {
    setDeletingId(t.id);
    setError(null);
    try {
      await apiRequest(`/api/admin/teachers/${t.id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      await loadTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete teacher.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers.filter((t) => {
      if (deptFilter !== 'all' && t.department_id !== deptFilter) return false;
      if (!q) return true;
      return (
        t.full_name.toLowerCase().includes(q) ||
        t.teacher_id.toLowerCase().includes(q) ||
        (t.designation || '').toLowerCase().includes(q) ||
        (t.specialization || '').toLowerCase().includes(q)
      );
    });
  }, [deptFilter, search, teachers]);

  const groupedByDept = useMemo(() => {
    const map = new Map<string, { dept: Department | null; items: TeacherRecord[] }>();
    filteredTeachers.forEach((t) => {
      const key = t.department_id || 'none';
      const existing = map.get(key);
      if (existing) {
        existing.items.push(t);
      } else {
        map.set(key, {
          dept: t.department || null,
          items: [t],
        });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.dept?.name || 'Z').localeCompare(b.dept?.name || 'Z', undefined, { sensitivity: 'base' })
    );
  }, [filteredTeachers]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Teachers &amp; Faculty</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Provision department-categorized faculty accounts. Teachers can publish announcements/links and inspect student profiles, without access to personal or group chats.
        </p>
      </div>

      {!schemaReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div className="space-y-3">
              <div>
                <p className="font-semibold">Migration 006 Required for Faculty Portal</p>
                <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
                  Run the updated SQL migrations (which include <span className="font-mono">006_teacher_portal.sql</span>) in your Supabase SQL Editor to create the <span className="font-mono">public.teachers</span> table and announcement link columns.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  disabled={copyingSql}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-amber-800 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-900 dark:bg-amber-600"
                >
                  {copyingSql ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : sqlCopied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{sqlCopied ? 'Copied Complete SQL!' : 'Copy Complete Migration SQL'}</span>
                </button>
                <button
                  type="button"
                  onClick={loadTeachers}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100/60 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Re-check Database</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {issuedCredential && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                One-Time Temporary Password Issued for {issuedCredential.teacherId}
              </p>
              <p className="mt-1 text-xs text-emerald-900 dark:text-emerald-200">
                Share these credentials securely. The teacher must set a private password upon first sign-in.
              </p>
              <p className="mt-2 font-mono text-sm font-bold text-slate-900 dark:text-white">
                {issuedCredential.password}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(issuedCredential.password);
                setCopiedPw(true);
                setTimeout(() => setCopiedPw(false), 3000);
              }}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-900 dark:bg-emerald-600"
            >
              {copiedPw ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedPw ? 'Copied' : 'Copy Password'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Provision New Teacher Form */}
      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          <h2 className="text-base font-semibold">Provision New Teacher Account</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <input
            type="text"
            required
            placeholder="Teacher ID (e.g. TCH-CHEM-01)"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value.toUpperCase())}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
          <select
            aria-label="Prefix or honorific"
            value={honorific}
            onChange={(e) => setHonorific(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">No Prefix</option>
            {TEACHER_HONORIFIC_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            type="text"
            required
            placeholder="Full Name (e.g. Ananya Das)"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
          <select
            required
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-4 dark:border-slate-700 dark:bg-slate-950"
          >
            {departments.length === 0 && <option value="">No departments</option>}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <input
            type="text"
            placeholder="Designation (e.g. Assistant Professor)"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="text"
            placeholder="Specialization (optional)"
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={personalEmail}
            onChange={(e) => setPersonalEmail(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="tel"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={creating || !schemaReady || !departmentId}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-teal-700 px-5 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span>Create Teacher Account</span>
          </button>
        </div>
      </form>

      {/* Department Category Filter & Search */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDeptFilter('all')}
            className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium ${
              deptFilter === 'all'
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            All Departments ({teachers.length})
          </button>
          {departments.map((d) => {
            const count = teachers.filter((t) => t.department_id === d.id).length;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDeptFilter(d.id)}
                className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium ${
                  deptFilter === d.id
                    ? 'bg-teal-700 text-white dark:bg-teal-600'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {d.name} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search by teacher name, ID, designation, or specialization..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      {/* Categorized Faculty Directory */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-teal-700" />
        </div>
      ) : groupedByDept.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          No teacher accounts created yet. Use the form above to provision faculty members by department.
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDept.map((group) => (
            <section
              key={group.dept?.id || 'none'}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <h3 className="text-sm font-semibold">
                    {group.dept?.name || 'Department'}{' '}
                    {group.dept?.code && (
                      <span className="font-mono text-xs text-slate-500">({group.dept.code})</span>
                    )}
                  </h3>
                </div>
                <span className="font-mono text-xs text-slate-500">
                  {group.items.length} faculty
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.map((t) => {
                  const isEditing = editingId === t.id;
                  return (
                    <div key={t.id} className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {formatTeacherName(t)}
                            </span>
                            <span className="font-mono text-xs font-medium text-teal-700 dark:text-teal-400">
                              {t.teacher_id}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                t.is_active
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                              }`}
                            >
                              {t.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t.designation}
                            {t.specialization ? ` · ${t.specialization}` : ''}
                            {t.personal_email ? ` · ${t.personal_email}` : ''}
                            {t.phone ? ` · ${t.phone}` : ''}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditing) {
                                setEditingId(null);
                              } else {
                                setEditingId(t.id);
                                setEditDraft({
                                  honorific: t.honorific || '',
                                  full_name: t.full_name,
                                  department_id: t.department_id,
                                  designation: t.designation,
                                  specialization: t.specialization || '',
                                  is_active: t.is_active,
                                });
                              }
                            }}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>{isEditing ? 'Close' : 'Edit'}</span>
                          </button>

                          {confirmResetId === t.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={resettingId === t.id}
                                onClick={() => handleResetPassword(t)}
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-amber-700 px-2.5 py-1 text-xs font-medium text-white"
                              >
                                {resettingId === t.id && <Loader2 className="h-3 w-3 animate-spin" />}
                                <span>Issue Temp Password</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmResetId(null)}
                                className="px-1.5 text-xs text-slate-500"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmResetId(t.id)}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              <span>Reset Password</span>
                            </button>
                          )}

                          {isSuperAdmin &&
                            (confirmDeleteId === t.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={deletingId === t.id}
                                  onClick={() => handleDelete(t)}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1 text-xs font-medium text-white"
                                >
                                  {deletingId === t.id && <Loader2 className="h-3 w-3 animate-spin" />}
                                  <span>Confirm Delete</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-1.5 text-xs text-slate-500"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(t.id)}
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </button>
                            ))}
                        </div>
                      </div>

                      {isEditing && (
                        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-12 dark:border-slate-800 dark:bg-slate-950/50">
                          <input
                            type="text"
                            maxLength={24}
                            placeholder="Prefix (Dr., Prof.)"
                            value={editDraft.honorific || ''}
                            onChange={(e) => setEditDraft((d) => ({ ...d, honorific: e.target.value }))}
                            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs sm:col-span-2 dark:border-slate-700 dark:bg-slate-900"
                          />
                          <input
                            type="text"
                            placeholder="Full Name"
                            value={editDraft.full_name || ''}
                            onChange={(e) => setEditDraft((d) => ({ ...d, full_name: e.target.value }))}
                            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs sm:col-span-3 dark:border-slate-700 dark:bg-slate-900"
                          />
                          <select
                            value={editDraft.department_id || ''}
                            onChange={(e) => setEditDraft((d) => ({ ...d, department_id: e.target.value }))}
                            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs sm:col-span-3 dark:border-slate-700 dark:bg-slate-900"
                          >
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Designation"
                            value={editDraft.designation || ''}
                            onChange={(e) => setEditDraft((d) => ({ ...d, designation: e.target.value }))}
                            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs sm:col-span-2 dark:border-slate-700 dark:bg-slate-900"
                          />
                          <input
                            type="text"
                            placeholder="Specialization"
                            value={editDraft.specialization || ''}
                            onChange={(e) => setEditDraft((d) => ({ ...d, specialization: e.target.value }))}
                            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs sm:col-span-2 dark:border-slate-700 dark:bg-slate-900"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-12">
                            <label className="flex items-center gap-2 text-xs font-medium">
                              <input
                                type="checkbox"
                                checked={Boolean(editDraft.is_active)}
                                onChange={(e) => setEditDraft((d) => ({ ...d, is_active: e.target.checked }))}
                                className="h-4 w-4 accent-teal-700"
                              />
                              <span>Active</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="min-h-[34px] rounded-lg px-3 text-xs font-medium text-slate-600"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={savingId === t.id}
                                onClick={() => handleSaveEdit(t.id)}
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-teal-700 px-3.5 text-xs font-medium text-white hover:bg-teal-800"
                              >
                                {savingId === t.id && <Loader2 className="h-3 w-3 animate-spin" />}
                                <span>Save Changes</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
