import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Briefcase,
  Camera,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  MapPin,
  Save,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import { formatTeacherName, TEACHER_HONORIFIC_PRESETS } from '../../lib/teacherDisplay';
import { AvatarThumb } from '../common/AvatarThumb';

function isPresetHonorific(val: string | null | undefined): boolean {
  if (!val) return true;
  return (TEACHER_HONORIFIC_PRESETS as readonly string[]).includes(val);
}

export const TeacherProfile: React.FC = () => {
  const { teacher, refreshProfile } = useAuth();

  const [honorific, setHonorific] = useState(teacher?.honorific || '');
  const [customHonorificMode, setCustomHonorificMode] = useState(
    Boolean(teacher?.honorific && !isPresetHonorific(teacher.honorific))
  );
  const [fullName, setFullName] = useState(teacher?.full_name || '');
  const [designation, setDesignation] = useState(teacher?.designation || '');
  const [qualification, setQualification] = useState(teacher?.qualification || '');
  const [experienceYears, setExperienceYears] = useState(
    teacher?.experience_years !== null && teacher?.experience_years !== undefined
      ? String(teacher.experience_years)
      : ''
  );
  const [specialization, setSpecialization] = useState(teacher?.specialization || '');
  const [subjectsInput, setSubjectsInput] = useState((teacher?.subjects_taught || []).join(', '));
  const [researchInput, setResearchInput] = useState((teacher?.research_areas || []).join(', '));
  const [officeLocation, setOfficeLocation] = useState(teacher?.office_location || '');
  const [officeHours, setOfficeHours] = useState(teacher?.office_hours || '');
  const [personalEmail, setPersonalEmail] = useState(teacher?.personal_email || '');
  const [phone, setPhone] = useState(teacher?.phone || '');
  const [websiteUrl, setWebsiteUrl] = useState(teacher?.website_url || '');
  const [publicationsSummary, setPublicationsSummary] = useState(
    teacher?.publications_summary || ''
  );
  const [bio, setBio] = useState(teacher?.bio || '');

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teacher) return;
    setHonorific(teacher.honorific || '');
    setCustomHonorificMode(Boolean(teacher.honorific && !isPresetHonorific(teacher.honorific)));
    setFullName(teacher.full_name || '');
    setDesignation(teacher.designation || '');
    setQualification(teacher.qualification || '');
    setExperienceYears(
      teacher.experience_years !== null && teacher.experience_years !== undefined
        ? String(teacher.experience_years)
        : ''
    );
    setSpecialization(teacher.specialization || '');
    setSubjectsInput((teacher.subjects_taught || []).join(', '));
    setResearchInput((teacher.research_areas || []).join(', '));
    setOfficeLocation(teacher.office_location || '');
    setOfficeHours(teacher.office_hours || '');
    setPersonalEmail(teacher.personal_email || '');
    setPhone(teacher.phone || '');
    setWebsiteUrl(teacher.website_url || '');
    setPublicationsSummary(teacher.publications_summary || '');
    setBio(teacher.bio || '');
  }, [teacher]);

  if (!teacher) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFeedback(null);

    try {
      await apiRequest('/api/teacher/profile', {
        method: 'PUT',
        body: {
          honorific: honorific.trim() || null,
          fullName: fullName.trim(),
          designation: designation.trim(),
          specialization: specialization.trim() || null,
          qualification: qualification.trim() || null,
          experienceYears: experienceYears.trim() !== '' ? Number(experienceYears) : null,
          subjectsTaught: subjectsInput,
          researchAreas: researchInput,
          officeLocation: officeLocation.trim() || null,
          officeHours: officeHours.trim() || null,
          personalEmail: personalEmail.trim() || null,
          phone: phone.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          publicationsSummary: publicationsSummary.trim() || null,
          bio: bio.trim() || null,
        },
      });
      await refreshProfile();
      setFeedback('Your professional profile has been saved and is visible in the Faculty directory.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save professional profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    setFeedback(null);

    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Profile photo must be under 2 MB.');
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });

      await apiRequest('/api/teacher/profile/avatar', {
        method: 'POST',
        body: {
          contentType: file.type || 'image/png',
          base64Data: dataUrl,
        },
      });

      await refreshProfile();
      setFeedback('Faculty profile photo uploaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
          Faculty Professional Profile
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">My Professional Profile</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Complete your academic credentials, subjects taught, research areas, and office hours so students can find your faculty profile.
        </p>
      </div>

      {!teacher.profile_completed && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <p className="font-semibold">Complete Your Professional Profile</p>
            <p className="mt-0.5 text-xs text-amber-900 dark:text-amber-200">
              Your Teacher ID (<span className="font-mono font-semibold">{teacher.teacher_id}</span>) is active. Fill in your qualifications, subjects, research focus, and consultation hours below and save to publish your full profile to the student Teachers directory.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Faculty Card */}
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <AvatarThumb
                src={teacher.avatar_url}
                alt={teacher.full_name}
                fallbackText={teacher.full_name}
                sizeClass="h-20 w-20"
                roundedClass="rounded-2xl"
              />
              <label
                htmlFor="teacher-avatar-upload"
                className="absolute -bottom-2 -right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                title="Upload profile photo"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                <input
                  id="teacher-avatar-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleAvatarUpload}
                  className="sr-only"
                />
              </label>
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{formatTeacherName(teacher)}</h2>
              <p className="font-mono text-xs font-medium text-teal-700 dark:text-teal-400">
                {teacher.teacher_id}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {teacher.designation}
              </p>
            </div>
          </div>

          <dl className="divide-y divide-slate-100 border-t border-slate-100 text-xs dark:divide-slate-800 dark:border-slate-800">
            <div className="flex justify-between gap-2 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Department</dt>
              <dd className="text-right font-medium">{teacher.department?.name || 'Department'}</dd>
            </div>
            <div className="flex justify-between gap-2 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Qualification</dt>
              <dd className="text-right font-medium">{teacher.qualification || 'Not filled yet'}</dd>
            </div>
            <div className="flex justify-between gap-2 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Experience</dt>
              <dd className="text-right font-medium">
                {teacher.experience_years !== null && teacher.experience_years !== undefined
                  ? `${teacher.experience_years} yrs`
                  : 'Not set'}
              </dd>
            </div>
            <div className="flex justify-between gap-2 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Office Room</dt>
              <dd className="text-right font-medium">{teacher.office_location || 'Not set'}</dd>
            </div>
            <div className="flex justify-between gap-2 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Office Hours</dt>
              <dd className="text-right font-medium">{teacher.office_hours || 'Not set'}</dd>
            </div>
            <div className="flex justify-between gap-2 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Profile Status</dt>
              <dd
                className={`text-right font-semibold ${
                  teacher.profile_completed
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {teacher.profile_completed ? 'Published' : 'Incomplete'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Right Editable Professional Profile Form */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-8">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <h2 className="text-lg font-semibold">Academic &amp; Professional Credentials</h2>
          </div>

          {feedback && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSave} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label htmlFor="tp-honorific" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Prefix / Honorific
                </label>
                <select
                  id="tp-honorific"
                  value={customHonorificMode ? '__custom__' : honorific}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setCustomHonorificMode(true);
                      if (isPresetHonorific(honorific)) setHonorific('');
                    } else {
                      setCustomHonorificMode(false);
                      setHonorific(val);
                    }
                  }}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">None</option>
                  {TEACHER_HONORIFIC_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="__custom__">Custom...</option>
                </select>
                {customHonorificMode && (
                  <input
                    type="text"
                    maxLength={24}
                    placeholder="e.g. Rev., Acharya"
                    value={honorific}
                    onChange={(e) => setHonorific(e.target.value)}
                    aria-label="Custom prefix or honorific"
                    className="mt-2 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                )}
              </div>

              <div className="sm:col-span-4">
                <label htmlFor="tp-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Full Name
                </label>
                <input
                  id="tp-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div className="sm:col-span-5">
                <label htmlFor="tp-desig" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Designation / Role
                </label>
                <input
                  id="tp-desig"
                  type="text"
                  required
                  placeholder="e.g. Assistant Professor, Associate Professor, HOD"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="tp-qual" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Highest Qualification / Degrees
                </label>
                <input
                  id="tp-qual"
                  type="text"
                  placeholder="e.g. Ph.D. in Chemistry, M.Sc. (Organic)"
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="tp-exp" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Teaching Experience (Years)
                </label>
                <input
                  id="tp-exp"
                  type="number"
                  min={0}
                  max={70}
                  placeholder="e.g. 8"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label htmlFor="tp-spec" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Primary Specialization
              </label>
              <input
                id="tp-spec"
                type="text"
                placeholder="e.g. Organic Synthesis, Coordination Chemistry, Quantum Mechanics"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tp-subjects" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <BookOpen className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                  <span>Subjects / Courses Taught (comma-separated)</span>
                </label>
                <input
                  id="tp-subjects"
                  type="text"
                  placeholder="e.g. Organic Chemistry, Spectroscopy, Lab IV"
                  value={subjectsInput}
                  onChange={(e) => setSubjectsInput(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="tp-research" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Research Areas (comma-separated)
                </label>
                <input
                  id="tp-research"
                  type="text"
                  placeholder="e.g. Green Catalysis, Nanomaterials"
                  value={researchInput}
                  onChange={(e) => setResearchInput(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tp-office" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <MapPin className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                  <span>Office / Cabin Location</span>
                </label>
                <input
                  id="tp-office"
                  type="text"
                  placeholder="e.g. Science Block, Room 204"
                  value={officeLocation}
                  onChange={(e) => setOfficeLocation(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="tp-hours" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Clock className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                  <span>Student Consultation / Office Hours</span>
                </label>
                <input
                  id="tp-hours"
                  type="text"
                  placeholder="e.g. Mon–Fri, 11:00 AM – 1:00 PM"
                  value={officeHours}
                  onChange={(e) => setOfficeHours(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="tp-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Faculty Contact Email
                </label>
                <input
                  id="tp-email"
                  type="email"
                  placeholder="faculty@ddu.edu.in"
                  value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="tp-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Contact Phone (optional)
                </label>
                <input
                  id="tp-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="tp-web" className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Globe className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                  <span>Academic / Scholar Link</span>
                </label>
                <input
                  id="tp-web"
                  type="url"
                  placeholder="https://scholar.google.com/..."
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label htmlFor="tp-bio" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Professional Biography &amp; Teaching Overview
              </label>
              <textarea
                id="tp-bio"
                rows={3}
                placeholder="Share your academic journey, teaching philosophy, and guidance areas for students..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label htmlFor="tp-pubs" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Publications, Projects &amp; Achievements (optional)
              </label>
              <textarea
                id="tp-pubs"
                rows={2}
                placeholder="List selected papers, research grants, patents, or academic awards..."
                value={publicationsSummary}
                onChange={(e) => setPublicationsSummary(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? 'Saving Profile...' : 'Save Professional Profile'}</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
