import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Building2,
  Clock,
  ExternalLink,
  Eye,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import { formatTeacherName } from '../../lib/teacherDisplay';
import type { Department, TeacherRecord } from '../../types/database';
import { AvatarThumb } from '../common/AvatarThumb';

export const StudentTeachers: React.FC<{
  onOpenAdminTeachers?: () => void;
}> = ({ onOpenAdminTeachers }) => {
  const { student, isSuperAdmin, isBatchAdmin } = useAuth();
  const canManageTeachers = isSuperAdmin || isBatchAdmin;
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schemaReady, setSchemaReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherRecord | null>(null);

  const loadFaculty = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        teachers: TeacherRecord[];
        departments: Department[];
        schemaReady: boolean;
      }>('/api/faculty');
      setTeachers(res.teachers || []);
      setSchemaReady(res.schemaReady !== false);
      setDepartments(
        (res.departments || []).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load faculty profiles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFaculty();
  }, [loadFaculty]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers
      .filter((t) => {
        if (deptFilter !== 'all' && t.department_id !== deptFilter) return false;
        if (!q) return true;
        const subjects = (t.subjects_taught || []).join(' ').toLowerCase();
        const research = (t.research_areas || []).join(' ').toLowerCase();
        return (
          formatTeacherName(t).toLowerCase().includes(q) ||
          (t.full_name || '').toLowerCase().includes(q) ||
          (t.teacher_id || '').toLowerCase().includes(q) ||
          (t.designation || '').toLowerCase().includes(q) ||
          (t.qualification || '').toLowerCase().includes(q) ||
          (t.specialization || '').toLowerCase().includes(q) ||
          (t.department?.name || '').toLowerCase().includes(q) ||
          subjects.includes(q) ||
          research.includes(q)
        );
      })
      .sort((a, b) =>
        (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })
      );
  }, [deptFilter, search, teachers]);

  const groupedByDept = useMemo(() => {
    const map = new Map<string, { dept: Department | null; items: TeacherRecord[] }>();
    filteredTeachers.forEach((t) => {
      const key = t.department_id || 'other';
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
            Dharanidhar University · Dedicated Faculty Directory
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Teachers &amp; Faculty Profiles</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Browse verified teachers’ academic qualifications, subjects taught, research areas, and consultation hours by department.
          </p>
        </div>
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
          {filteredTeachers.length} faculty {filteredTeachers.length === 1 ? 'profile' : 'profiles'}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {/* Department Filter & Search */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDeptFilter('all')}
            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              deptFilter === 'all'
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            All Departments ({teachers.length})
          </button>
          {departments.map((d) => {
            const count = teachers.filter((t) => t.department_id === d.id).length;
            const isOwnDept = student?.department_id === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDeptFilter(d.id)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  deptFilter === d.id
                    ? 'bg-teal-700 text-white dark:bg-teal-600'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {isOwnDept ? `My Dept: ${d.code}` : d.name} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search teachers by name, qualification, specialization, subjects, or research..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 focus:border-teal-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Teachers Categorized by Department */}
      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
        </div>
      ) : groupedByDept.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <GraduationCap className="mx-auto h-8 w-8 text-slate-400" />
          {!schemaReady ? (
            <>
              <p className="mt-3 text-sm font-semibold text-amber-900 dark:text-amber-200">
                Faculty Portal database setup is pending
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-600 dark:text-slate-400">
                Migration <span className="font-mono">006_teacher_portal.sql</span> has not been applied in Supabase yet, so the teachers table does not exist.
              </p>
              {canManageTeachers && onOpenAdminTeachers && (
                <button
                  type="button"
                  onClick={onOpenAdminTeachers}
                  className="mt-4 inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 dark:bg-teal-600"
                >
                  <span>Open Admin → Teachers Setup</span>
                </button>
              )}
            </>
          ) : teachers.length === 0 ? (
            <>
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                No teacher accounts added yet
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                Teacher accounts are provisioned by university administrators (Super Admin or Batch Admin) in Admin Mode → Teachers. Once a teacher account is created, it will appear here immediately.
              </p>
              {canManageTeachers && onOpenAdminTeachers && (
                <button
                  type="button"
                  onClick={onOpenAdminTeachers}
                  className="mt-4 inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 dark:bg-teal-600"
                >
                  <span>Provision Teacher in Admin Mode</span>
                </button>
              )}
            </>
          ) : (
            <>
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                No teachers match your current filter
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Try switching back to All Departments or clearing your search query.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDeptFilter('all');
                  setSearch('');
                }}
                className="mt-4 inline-flex min-h-[36px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Clear Filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDept.map((group) => (
            <section key={group.dept?.id || 'other'} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {group.dept?.name || 'Department Faculty'}{' '}
                    {group.dept?.code && (
                      <span className="font-mono text-xs font-normal text-slate-500">
                        ({group.dept.code})
                      </span>
                    )}
                  </h2>
                </div>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {group.items.length} faculty
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((t) => (
                  <article
                    key={t.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div>
                      <div className="flex items-start gap-3.5">
                        <AvatarThumb
                          src={t.avatar_url}
                          alt={formatTeacherName(t)}
                          fallbackText={t.full_name}
                          sizeClass="h-12 w-12"
                          roundedClass="rounded-xl"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                            {formatTeacherName(t)}
                          </h3>
                          <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
                            {t.designation}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {t.teacher_id}
                            {t.experience_years !== null && t.experience_years !== undefined
                              ? ` · ${t.experience_years} yrs exp.`
                              : ''}
                          </p>
                        </div>
                      </div>

                      {t.qualification && (
                        <p className="mt-3 text-xs font-medium text-slate-800 dark:text-slate-200">
                          {t.qualification}
                        </p>
                      )}

                      {t.specialization && (
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          Specialization: {t.specialization}
                        </p>
                      )}

                      {t.bio && (
                        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          {t.bio}
                        </p>
                      )}

                      {t.subjects_taught && t.subjects_taught.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {t.subjects_taught.slice(0, 3).map((subj) => (
                            <span
                              key={subj}
                              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {subj}
                            </span>
                          ))}
                          {t.subjects_taught.length > 3 && (
                            <span className="text-[11px] text-slate-500">
                              +{t.subjects_taught.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      {(t.office_location || t.office_hours) && (
                        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                          {t.office_location && (
                            <p className="flex items-center gap-1.5 truncate">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{t.office_location}</span>
                            </p>
                          )}
                          {t.office_hours && (
                            <p className="flex items-center gap-1.5 truncate">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{t.office_hours}</span>
                            </p>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedTeacher(t)}
                        className="inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        <Eye className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                        <span>View Full Professional Profile</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Full Teacher Professional Profile Modal */}
      {selectedTeacher && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="faculty-profile-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setSelectedTeacher(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-4 min-w-0">
                <AvatarThumb
                  src={selectedTeacher.avatar_url}
                  alt={formatTeacherName(selectedTeacher)}
                  fallbackText={selectedTeacher.full_name}
                  sizeClass="h-16 w-16"
                  roundedClass="rounded-2xl"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
                    {selectedTeacher.department?.name || 'University Faculty'}
                  </p>
                  <h2 id="faculty-profile-modal-title" className="truncate text-xl font-bold">
                    {formatTeacherName(selectedTeacher)}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {selectedTeacher.designation} ·{' '}
                    <span className="font-mono">{selectedTeacher.teacher_id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeacher(null)}
                aria-label="Close teacher profile"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <GraduationCap className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                    <span>Academic Credentials</span>
                  </div>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div>
                      <dt className="text-slate-500">Qualification</dt>
                      <dd className="font-medium text-slate-900 dark:text-slate-100">
                        {selectedTeacher.qualification || 'Not specified'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Specialization</dt>
                      <dd className="font-medium text-slate-900 dark:text-slate-100">
                        {selectedTeacher.specialization || 'General'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Experience</dt>
                      <dd className="font-medium text-slate-900 dark:text-slate-100">
                        {selectedTeacher.experience_years !== null &&
                        selectedTeacher.experience_years !== undefined
                          ? `${selectedTeacher.experience_years} years`
                          : 'Not specified'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <MapPin className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                    <span>Office &amp; Contact Details</span>
                  </div>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div>
                      <dt className="text-slate-500">Office Location</dt>
                      <dd className="font-medium text-slate-900 dark:text-slate-100">
                        {selectedTeacher.office_location || 'Department Faculty Room'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Consultation / Office Hours</dt>
                      <dd className="font-medium text-slate-900 dark:text-slate-100">
                        {selectedTeacher.office_hours || 'By appointment'}
                      </dd>
                    </div>
                    {selectedTeacher.personal_email && (
                      <p className="flex items-center gap-1.5 pt-1 text-slate-700 dark:text-slate-300">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span>{selectedTeacher.personal_email}</span>
                      </p>
                    )}
                    {selectedTeacher.phone && (
                      <p className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-mono">{selectedTeacher.phone}</span>
                      </p>
                    )}
                  </dl>
                </div>
              </div>

              {selectedTeacher.bio && (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Professional Biography
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {selectedTeacher.bio}
                  </p>
                </div>
              )}

              {((selectedTeacher.subjects_taught?.length ?? 0) > 0 ||
                (selectedTeacher.research_areas?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {selectedTeacher.subjects_taught && selectedTeacher.subjects_taught.length > 0 && (
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <BookOpen className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                        <span>Subjects Taught</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedTeacher.subjects_taught.map((s) => (
                          <span
                            key={s}
                            className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedTeacher.research_areas && selectedTeacher.research_areas.length > 0 && (
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <Award className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                        <span>Research Areas</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedTeacher.research_areas.map((r) => (
                          <span
                            key={r}
                            className="rounded-md bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedTeacher.publications_summary && (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Publications &amp; Academic Achievements
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {selectedTeacher.publications_summary}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {selectedTeacher.website_url &&
                /^https?:\/\/.+/i.test(selectedTeacher.website_url) ? (
                  <a
                    href={selectedTeacher.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Visit Academic / Scholar Page</span>
                  </a>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={() => setSelectedTeacher(null)}
                  className="min-h-[38px] rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
