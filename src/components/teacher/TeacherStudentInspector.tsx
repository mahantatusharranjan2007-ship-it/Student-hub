import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Eye,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useStudentBadges } from '../../hooks/useStudentBadges';
import { apiRequest } from '../../lib/api';
import { getUniqueRowAccentClass } from '../../lib/studentBadges';
import type { Course, Department, ProfileRecord, StudentRecord } from '../../types/database';
import { AvatarWithBadgeFrame, StudentBadgesLine } from '../common/PremiumRoleBadge';

interface InspectedEntry {
  student: StudentRecord;
  profile: ProfileRecord | null;
}

export const TeacherStudentInspector: React.FC = () => {
  const { teacher } = useAuth();
  const { getBadgeForUser } = useStudentBadges();
  const [entries, setEntries] = useState<InspectedEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>(teacher?.department_id || 'all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [inspected, setInspected] = useState<InspectedEntry | null>(null);

  useEffect(() => {
    if (teacher?.department_id && deptFilter === 'all') {
      // Keep default selection focused on teacher's own department on initial load
      setDeptFilter(teacher.department_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher?.department_id]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        entries: InspectedEntry[];
        departments: Department[];
        courses: Course[];
      }>('/api/teacher/students');
      setEntries(res.entries || []);
      setDepartments(res.departments || []);
      setCourses(res.courses || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load student profiles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const availableCourses = useMemo(() => {
    if (deptFilter === 'all') return courses;
    return courses.filter((c) => c.department_id === deptFilter);
  }, [courses, deptFilter]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter(({ student, profile }) => {
        if (deptFilter !== 'all' && student.department_id !== deptFilter) return false;
        if (courseFilter !== 'all' && student.course_id !== courseFilter) return false;
        if (statusFilter !== 'all' && student.student_status !== statusFilter) return false;
        if (!q) return true;
        const name = (profile?.display_name || student.full_name).toLowerCase();
        const fullName = student.full_name.toLowerCase();
        const sid = student.student_id.toLowerCase();
        const roll = (student.roll_number || '').toLowerCase();
        return name.includes(q) || fullName.includes(q) || sid.includes(q) || roll.includes(q);
      })
      .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, undefined, { sensitivity: 'base' }));
  }, [courseFilter, deptFilter, entries, search, statusFilter]);

  // Group filtered students by department
  const groupedByDepartment = useMemo(() => {
    const groups = new Map<string, { dept: Department | null; items: InspectedEntry[] }>();
    filteredEntries.forEach((entry) => {
      const key = entry.student.department_id || 'unassigned';
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(entry);
      } else {
        groups.set(key, {
          dept: entry.student.department || null,
          items: [entry],
        });
      }
    });
    return Array.from(groups.values()).sort((a, b) =>
      (a.dept?.name || 'Z').localeCompare(b.dept?.name || 'Z', undefined, { sensitivity: 'base' })
    );
  }, [filteredEntries]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
          Faculty Student Inspection · Categorized by Department
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Inspect Student Profiles</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Review student academic records, enrollment status, and profile details across departments.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Department Category Pills & Filters */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setDeptFilter('all');
              setCourseFilter('all');
            }}
            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              deptFilter === 'all'
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            All Departments ({entries.length})
          </button>
          {departments.map((d) => {
            const count = entries.filter((e) => e.student.department_id === d.id).length;
            const isOwn = teacher?.department_id === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDeptFilter(d.id);
                  setCourseFilter('all');
                }}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  deptFilter === d.id
                    ? 'bg-teal-700 text-white dark:bg-teal-600'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {isOwn ? `My Dept: ${d.code}` : d.name} ({count})
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="relative sm:col-span-6">
            <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search student name, Student ID, or roll number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="sm:col-span-3">
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              aria-label="Filter by course"
              className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="all">All Courses</option>
              {availableCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by student status"
              className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="alumni">Alumni</option>
            </select>
          </div>
        </div>
      </div>

      {/* Categorized Student List */}
      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
        </div>
      ) : groupedByDepartment.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <Users className="mx-auto h-7 w-7 text-slate-400" />
          <p className="mt-2 text-sm font-medium">No students match the current filter</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDepartment.map((group) => (
            <section
              key={group.dept?.id || 'unassigned'}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {group.dept?.name || 'Unassigned Department'}{' '}
                    {group.dept?.code && (
                      <span className="font-mono text-xs text-slate-500">({group.dept.code})</span>
                    )}
                  </h2>
                </div>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {group.items.length} students
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.map((entry) => {
                  const { student, profile } = entry;
                  const badge = getBadgeForUser(student.user_id);
                  return (
                    <div
                      key={student.id}
                      className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${getUniqueRowAccentClass(badge)}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <AvatarWithBadgeFrame
                          src={profile?.avatar_url}
                          alt={profile?.display_name || student.full_name}
                          fallbackText={student.full_name}
                          sizeClass="h-11 w-11"
                          roundedClass="rounded-xl"
                          badge={badge}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {student.full_name}
                            </p>
                            <StudentBadgesLine badge={badge} compact />
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${
                                student.student_status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {student.student_status}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                              {student.student_id}
                            </span>{' '}
                            · {student.course?.name || 'Course'} · Sem {student.semester}
                            {student.roll_number ? ` · Roll ${student.roll_number}` : ''}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setInspected(entry)}
                        className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        <Eye className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                        <span>Inspect Profile</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Student Profile Inspection Modal */}
      {inspected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspect-student-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setInspected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">
                Student Profile Inspection
              </p>
              <button
                type="button"
                onClick={() => setInspected(null)}
                aria-label="Close inspection modal"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Large Student Profile Picture Above Details */}
            <div className="mt-5 flex flex-col items-center border-b border-slate-200 pb-5 text-center dark:border-slate-800">
              <AvatarWithBadgeFrame
                src={inspected.profile?.avatar_url}
                alt={inspected.student.full_name}
                fallbackText={inspected.student.full_name}
                sizeClass="h-32 w-32 sm:h-36 sm:w-36"
                roundedClass="rounded-2xl"
                textClass="text-3xl"
                badge={getBadgeForUser(inspected.student.user_id)}
                className="shadow-sm"
              />
              <h2 id="inspect-student-title" className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
                {inspected.student.full_name}
              </h2>
              <StudentBadgesLine
                badge={getBadgeForUser(inspected.student.user_id)}
                className="mt-2 justify-center"
              />
              <p className="mt-1.5 font-mono text-xs font-medium text-teal-700 dark:text-teal-400">
                {inspected.student.student_id}
                {inspected.profile?.display_name &&
                inspected.profile.display_name !== inspected.student.full_name
                  ? ` · Display: ${inspected.profile.display_name}`
                  : ''}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {inspected.student.department?.name || 'Department'} · {inspected.student.course?.name || 'Course'}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <GraduationCap className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <span>Academic Record</span>
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Department</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">
                      {inspected.student.department?.name || 'Not set'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Course &amp; Semester</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">
                      {inspected.student.course?.name || 'Not set'} · Semester {inspected.student.semester}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Batch &amp; Roll Number</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">
                      {inspected.student.batch
                        ? `${inspected.student.batch.name} (Sec ${inspected.student.batch.section})`
                        : 'Unassigned'}
                      {inspected.student.roll_number ? ` · ${inspected.student.roll_number}` : ''}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <UserCheck className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <span>Enrollment &amp; Contact</span>
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Student Status</dt>
                    <dd className="font-semibold capitalize text-slate-900 dark:text-slate-100">
                      {inspected.student.student_status}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Academic Status</dt>
                    <dd className="font-semibold capitalize text-slate-900 dark:text-slate-100">
                      {inspected.student.academic_status.replace('_', ' ')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Verification</dt>
                    <dd className="font-semibold capitalize text-slate-900 dark:text-slate-100">
                      {inspected.student.verification_status.replace('_', ' ')}
                    </dd>
                  </div>
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                    <p className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      <span>{inspected.profile?.personal_email || 'No email recorded'}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span>{inspected.profile?.phone || 'No phone recorded'}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>{inspected.profile?.hometown || 'Hometown not set'}</span>
                    </p>
                  </div>
                </dl>
              </div>
            </div>

            {(inspected.profile?.bio || (inspected.profile?.academic_interests?.length ?? 0) > 0) && (
              <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                {inspected.profile?.bio && (
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Bio</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {inspected.profile.bio}
                    </p>
                  </div>
                )}
                {inspected.profile?.academic_interests &&
                  inspected.profile.academic_interests.length > 0 && (
                    <div className={inspected.profile?.bio ? 'mt-3' : ''}>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Academic Interests
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {inspected.profile.academic_interests.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
              <span>
                Last Login:{' '}
                {inspected.profile?.last_login_at
                  ? new Date(inspected.profile.last_login_at).toLocaleString('en-IN')
                  : 'Never'}
              </span>
              <button
                type="button"
                onClick={() => setInspected(null)}
                className="min-h-[38px] rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
