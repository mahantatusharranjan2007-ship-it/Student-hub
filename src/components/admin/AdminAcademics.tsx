import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import { getSupabaseClient } from '../../lib/supabase';
import type { Batch, Course, Department } from '../../types/database';

export const AdminAcademics: React.FC<{
  section: 'departments' | 'courses' | 'batches';
}> = ({ section }) => {
  const { isSuperAdmin } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Forms
  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptFaculty, setDeptFaculty] = useState('School of Physical & Chemical Sciences');

  const [courseDeptId, setCourseDeptId] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseLevel, setCourseLevel] = useState('Undergraduate');
  const [courseYears, setCourseYears] = useState(3);

  const [batchCourseId, setBatchCourseId] = useState('');
  const [batchName, setBatchName] = useState('');
  const [batchStart, setBatchStart] = useState(2025);
  const [batchEnd, setBatchEnd] = useState(2028);
  const [batchSection, setBatchSection] = useState('A');

  const loadAll = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const [{ data: d }, { data: c }, { data: b }] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('courses').select('*, department:departments(id, name, code)').order('name'),
      supabase
        .from('batches')
        .select('*, department:departments(id, name), course:courses(id, name, code)')
        .order('admission_year', { ascending: false }),
    ]);

    const depts = (d as Department[]) || [];
    const crs = (c as Course[]) || [];
    setDepartments(depts);
    setCourses(crs);
    setBatches((b as Batch[]) || []);
    setCourseDeptId((prev) => (depts.some((item) => item.id === prev) ? prev : depts[0]?.id || ''));
    setBatchCourseId((prev) => (crs.some((item) => item.id === prev) ? prev : crs[0]?.id || ''));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setConfirmDeleteId(null);
    setError(null);
    setSuccessMessage(null);
  }, [section]);

  const recordAudit = async (action: string, targetType: string, targetId: string, summary: string) => {
    await apiRequest('/api/admin/audit-log', {
      method: 'POST',
      body: { action, targetType, targetId, summary },
    }).catch(() => {});
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error: err } = await supabase
        .from('departments')
        .insert({
          code: deptCode.trim().toUpperCase(),
          name: deptName.trim(),
          faculty_area: deptFaculty.trim(),
        })
        .select('id, name, code')
        .single();
      if (err) throw new Error(err.message);
      await recordAudit('DEPARTMENT_CREATED', 'department', data.id, `Created department ${data.name} (${data.code}).`);
      setDeptCode('');
      setDeptName('');
      setSuccessMessage(`Department "${data.name}" created.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create department.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error: err } = await supabase
        .from('courses')
        .insert({
          department_id: courseDeptId,
          code: courseCode.trim().toUpperCase(),
          name: courseName.trim(),
          degree_level: courseLevel,
          duration_years: courseYears,
          total_semesters: courseYears * 2,
        })
        .select('id, name, code')
        .single();
      if (err) throw new Error(err.message);
      await recordAudit('COURSE_CREATED', 'course', data.id, `Created course ${data.name} (${data.code}).`);
      setCourseCode('');
      setCourseName('');
      setSuccessMessage(`Course "${data.name}" created.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create course.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const selectedCourse = courses.find((c) => c.id === batchCourseId);
      if (!selectedCourse) throw new Error('Select a valid course.');
      const supabase = getSupabaseClient();
      const { data, error: err } = await supabase
        .from('batches')
        .insert({
          department_id: selectedCourse.department_id,
          course_id: selectedCourse.id,
          name: batchName.trim() || `${selectedCourse.name} (${batchStart}–${batchEnd})`,
          admission_year: batchStart,
          graduation_year: batchEnd,
          section: batchSection.trim().toUpperCase() || 'A',
          current_semester: 1,
        })
        .select('id, name')
        .single();
      if (err) throw new Error(err.message);
      await recordAudit('BATCH_CREATED', 'batch', data.id, `Created batch ${data.name}.`);
      setBatchName('');
      setSuccessMessage(`Batch "${data.name}" created.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create batch.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (table: 'departments' | 'courses' | 'batches', id: string, current: boolean) => {
    setError(null);
    setSuccessMessage(null);
    const supabase = getSupabaseClient();
    const { error: err } = await supabase.from(table).update({ is_active: !current }).eq('id', id);
    if (err) {
      setError(err.message);
      return;
    }
    await recordAudit(`${table.toUpperCase()}_TOGGLED`, table, id, `Set ${table} ${id} active=${!current}.`);
    await loadAll();
  };

  const handleDelete = async (table: 'departments' | 'courses' | 'batches', id: string, label: string) => {
    setDeletingId(id);
    setError(null);
    setSuccessMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { data: deleted, error: delErr } = await supabase.from(table).delete().eq('id', id).select('id');
      if (delErr) {
        const isFk = delErr.code === '23503' || /foreign key|still referenced/i.test(delErr.message);
        if (isFk) {
          if (table === 'departments') {
            throw new Error(
              `Cannot delete department "${label}" because courses, batches, students, or registration requests still reference it. Delete or reassign dependent records first, or deactivate the department.`
            );
          }
          if (table === 'courses') {
            throw new Error(
              `Cannot delete course "${label}" because batches, students, or registration requests still reference it. Delete dependent batches or reassign students first, or deactivate the course.`
            );
          }
          throw new Error(
            `Cannot delete batch "${label}" because other records still reference it. Archive the batch instead.`
          );
        }
        throw new Error(delErr.message);
      }

      if (!deleted || deleted.length === 0) {
        throw new Error('Could not delete record. Ensure you have Super Admin permissions.');
      }

      const singular = table === 'departments' ? 'department' : table === 'courses' ? 'course' : 'batch';
      await recordAudit(`${singular.toUpperCase()}_DELETED`, singular, id, `Deleted ${singular} ${label}.`);
      setConfirmDeleteId(null);
      setSuccessMessage(`Deleted ${singular} "${label}".`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight capitalize">{section}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage Dharanidhar University academic structure for {section}.
        </p>
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

      {/* Creation Form */}
      {section === 'departments' && (
        <form
          onSubmit={handleCreateDepartment}
          className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-12 dark:border-slate-800 dark:bg-slate-900"
        >
          <input
            type="text"
            required
            placeholder="Code (e.g. PHYS)"
            value={deptCode}
            onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="text"
            required
            placeholder="Department Name (e.g. Physics)"
            value={deptName}
            onChange={(e) => setDeptName(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-4 dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="text"
            required
            placeholder="Faculty / School"
            value={deptFaculty}
            onChange={(e) => setDeptFaculty(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-4 dark:border-slate-700 dark:bg-slate-950"
          />
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 sm:col-span-2 dark:bg-teal-600"
          >
            <Plus className="h-4 w-4" />
            <span>Add Dept</span>
          </button>
        </form>
      )}

      {section === 'courses' && (
        <form
          onSubmit={handleCreateCourse}
          className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-12 dark:border-slate-800 dark:bg-slate-900"
        >
          <select
            value={courseDeptId}
            onChange={(e) => setCourseDeptId(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            required
            placeholder="Code (MSC-CHEM)"
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="text"
            required
            placeholder="Course Name (e.g. M.Sc. Chemistry)"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
          <select
            value={courseLevel}
            onChange={(e) => setCourseLevel(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="Undergraduate">Undergraduate</option>
            <option value="Postgraduate">Postgraduate</option>
            <option value="Doctoral">Doctoral</option>
          </select>
          <div className="flex gap-2 sm:col-span-2">
            <input
              type="number"
              min={1}
              max={6}
              value={courseYears}
              onChange={(e) => setCourseYears(Number(e.target.value))}
              className="w-16 min-h-[42px] rounded-xl border border-slate-300 bg-white px-2 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-xs font-medium text-white hover:bg-teal-800 dark:bg-teal-600"
            >
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </button>
          </div>
        </form>
      )}

      {section === 'batches' && (
        <form
          onSubmit={handleCreateBatch}
          className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-12 dark:border-slate-800 dark:bg-slate-900"
        >
          <select
            value={batchCourseId}
            onChange={(e) => setBatchCourseId(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Label (auto-generated if blank)"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="number"
            min={2010}
            max={2040}
            value={batchStart}
            onChange={(e) => setBatchStart(Number(e.target.value))}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            type="number"
            min={2010}
            max={2045}
            value={batchEnd}
            onChange={(e) => setBatchEnd(Number(e.target.value))}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          />
          <div className="flex gap-2 sm:col-span-2">
            <input
              type="text"
              maxLength={4}
              value={batchSection}
              onChange={(e) => setBatchSection(e.target.value.toUpperCase())}
              className="w-14 min-h-[42px] rounded-xl border border-slate-300 bg-white px-2 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-xs font-medium text-white hover:bg-teal-800 dark:bg-teal-600"
            >
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </button>
          </div>
        </form>
      )}

      {/* List Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-teal-700" />
          </div>
        ) : section === 'departments' ? (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Faculty Area</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No departments created yet.
                  </td>
                </tr>
              ) : (
                departments.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{d.code}</td>
                    <td className="px-4 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{d.faculty_area}</td>
                    <td className="px-4 py-3">
                      <span className={d.is_active ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}>
                        {d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSuperAdmin ? (
                        <div className="inline-flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => toggleActive('departments', d.id, d.is_active)}
                            className="min-h-[36px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                          >
                            {d.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          {confirmDeleteId === d.id ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={deletingId === d.id}
                                onClick={() => handleDelete('departments', d.id, `${d.name} (${d.code})`)}
                                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
                              >
                                {deletingId === d.id && <Loader2 className="h-3 w-3 animate-spin" />}
                                <span>Confirm</span>
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === d.id}
                                onClick={() => setConfirmDeleteId(null)}
                                className="min-h-[32px] px-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(d.id)}
                              className="inline-flex min-h-[36px] items-center gap-1 font-medium text-red-700 hover:underline dark:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">Super Admin only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : section === 'courses' ? (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Level · Duration</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {courses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No courses created yet.
                  </td>
                </tr>
              ) : (
                courses.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.department?.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {c.degree_level} · {c.duration_years} yrs ({c.total_semesters} sems)
                    </td>
                    <td className="px-4 py-3">
                      <span className={c.is_active ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSuperAdmin ? (
                        <div className="inline-flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => toggleActive('courses', c.id, c.is_active)}
                            className="min-h-[36px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                          >
                            {c.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          {confirmDeleteId === c.id ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={deletingId === c.id}
                                onClick={() => handleDelete('courses', c.id, `${c.name} (${c.code})`)}
                                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
                              >
                                {deletingId === c.id && <Loader2 className="h-3 w-3 animate-spin" />}
                                <span>Confirm</span>
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === c.id}
                                onClick={() => setConfirmDeleteId(null)}
                                className="min-h-[32px] px-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(c.id)}
                              className="inline-flex min-h-[36px] items-center gap-1 font-medium text-red-700 hover:underline dark:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">Super Admin only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Batch Name</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Years</th>
                <th className="px-4 py-3 font-medium">Sem · Sec</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No batches created yet.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-medium">{b.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{b.course?.name}</td>
                    <td className="px-4 py-3 font-mono">
                      {b.admission_year}–{b.graduation_year}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      Sem {b.current_semester} · Sec {b.section}
                    </td>
                    <td className="px-4 py-3">
                      <span className={b.is_active ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}>
                        {b.is_active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => toggleActive('batches', b.id, b.is_active)}
                          className="min-h-[36px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                        >
                          {b.is_active ? 'Archive' : 'Activate'}
                        </button>
                        {confirmDeleteId === b.id ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={deletingId === b.id}
                              onClick={() => handleDelete('batches', b.id, b.name)}
                              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
                            >
                              {deletingId === b.id && <Loader2 className="h-3 w-3 animate-spin" />}
                              <span>Confirm</span>
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === b.id}
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[32px] px-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(b.id)}
                            className="inline-flex min-h-[36px] items-center gap-1 font-medium text-red-700 hover:underline dark:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
