import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, MessageSquare, Phone, Search, Users } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useStudentBadges } from '../../hooks/useStudentBadges';
import { getSupabaseClient } from '../../lib/supabase';
import { getUniqueCardSurfaceClass } from '../../lib/studentBadges';
import { AvatarWithBadgeFrame, StudentBadgesLine } from '../common/PremiumRoleBadge';
import type { Course, Department, ProfileRecord, StudentRecord } from '../../types/database';

interface DirectoryEntry {
  student: StudentRecord;
  profile: ProfileRecord | null;
}

export const StudentDirectory: React.FC<{
  onStartMessage: (userId: string) => void;
}> = ({ onStartMessage }) => {
  const { student: currentStudent } = useAuth();
  const { getBadgeForUser } = useStudentBadges();
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'badged'>('all');
  const [loading, setLoading] = useState(true);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const [{ data: studentRows }, { data: profileRows }, { data: deptRows }, { data: courseRows }] =
      await Promise.all([
        supabase
          .from('students')
          .select(
            '*, department:departments(id, code, name), course:courses(id, code, name), batch:batches(id, name, admission_year, section)'
          )
          .eq('student_status', 'active')
          .order('full_name'),
        supabase.from('profiles').select('*'),
        supabase.from('departments').select('*').eq('is_active', true).order('name'),
        supabase.from('courses').select('*').eq('is_active', true).order('name'),
      ]);

    const profileMap = new Map<string, ProfileRecord>();
    (profileRows || []).forEach((p) => profileMap.set(p.id, p as ProfileRecord));

    const combined: DirectoryEntry[] = ((studentRows as StudentRecord[]) || [])
      .map((s) => ({
        student: s,
        profile: profileMap.get(s.user_id) || null,
      }))
      .sort((a, b) => {
        const nameA = (a.profile?.display_name || a.student.full_name).trim();
        const nameB = (b.profile?.display_name || b.student.full_name).trim();
        const cmp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return a.student.student_id.localeCompare(b.student.student_id);
      });

    setEntries(combined);
    setDepartments(
      ((deptRows as Department[]) || []).sort((a, b) =>
        a.name.trim().localeCompare(b.name.trim(), undefined, { sensitivity: 'base' })
      )
    );
    setCourses(
      ((courseRows as Course[]) || []).sort((a, b) =>
        a.name.trim().localeCompare(b.name.trim(), undefined, { sensitivity: 'base' })
      )
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const filtered = entries.filter(({ student, profile }) => {
    if (deptFilter !== 'all' && student.department_id !== deptFilter) return false;
    if (courseFilter !== 'all' && student.course_id !== courseFilter) return false;
    const badge = getBadgeForUser(student.user_id);
    if (badgeFilter === 'badged' && !badge) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      student.student_id.toLowerCase().includes(q) ||
      student.full_name.toLowerCase().includes(q) ||
      (profile?.display_name || '').toLowerCase().includes(q) ||
      (student.department?.name || '').toLowerCase().includes(q) ||
      (student.course?.name || '').toLowerCase().includes(q) ||
      (badge?.customTag || '').toLowerCase().includes(q) ||
      (badge?.highestAdminRole ? badge.highestAdminRole.replace('_', ' ').toLowerCase().includes(q) : false)
    );
  });

  const hasAnyBadged = entries.some(({ student }) => Boolean(getBadgeForUser(student.user_id)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Student Directory</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Browse verified peers across Dharanidhar University departments and cohorts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {hasAnyBadged && (
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setBadgeFilter('all')}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  badgeFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                All Peers
              </button>
              <button
                type="button"
                onClick={() => setBadgeFilter('badged')}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  badgeFilter === 'badged'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Admins &amp; Tagged
              </button>
            </div>
          )}
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {filtered.length} active profiles
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-12 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative sm:col-span-6">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search by name, Student ID, department, or tag..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div className="sm:col-span-3">
          <select
            aria-label="Filter by department"
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setCourseFilter('all');
            }}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <select
            aria-label="Filter by course"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="all">All Courses</option>
            {courses
              .filter((c) => deptFilter === 'all' || c.department_id === deptFilter)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <Users className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-medium">No matching students found</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Adjust your search filter or department selection.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ student, profile }) => {
            const name = profile?.display_name || student.full_name;
            const isSelf = currentStudent?.user_id === student.user_id;
            const badge = getBadgeForUser(student.user_id);
            const cardSurface = getUniqueCardSurfaceClass(badge);

            return (
              <article
                key={student.id}
                className={`flex flex-col justify-between rounded-2xl border p-5 transition-colors ${cardSurface}`}
              >
                <div className="flex items-start gap-3.5">
                  <AvatarWithBadgeFrame
                    src={profile?.avatar_url}
                    alt={name}
                    fallbackText={name}
                    sizeClass="h-12 w-12"
                    roundedClass="rounded-xl"
                    badge={badge}
                  />

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                      {name}
                    </h2>
                    <StudentBadgesLine badge={badge} className="mt-1" />
                    <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {student.student_id}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                      {student.department?.name} · {student.course?.name}
                    </p>
                  </div>
                </div>

                {profile?.bio && (
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {profile.bio}
                  </p>
                )}

                <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  {profile?.privacy_show_email && profile.personal_email && (
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{profile.personal_email}</span>
                    </div>
                  )}
                  {profile?.privacy_show_phone && profile.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-mono">{profile.phone}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Sem {student.semester} · {student.batch?.admission_year || 'Cohort'}
                  </span>
                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => onStartMessage(student.user_id)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Message</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
