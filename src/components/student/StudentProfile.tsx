import React, { useState } from 'react';
import { Camera, CheckCircle2, Loader2, Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useStudentBadges } from '../../hooks/useStudentBadges';
import { getSupabaseClient } from '../../lib/supabase';
import { getUniqueCardSurfaceClass } from '../../lib/studentBadges';
import { AvatarWithBadgeFrame, StudentBadgesLine } from '../common/PremiumRoleBadge';

export const StudentProfile: React.FC = () => {
  const { student, profile, roles, refreshProfile } = useAuth();
  const { getBadgeForUser } = useStudentBadges();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [personalEmail, setPersonalEmail] = useState(profile?.personal_email || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [hometown, setHometown] = useState(profile?.hometown || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [interestsInput, setInterestsInput] = useState((profile?.academic_interests || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [confirmingAcademic, setConfirmingAcademic] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!student || !profile) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const supabase = getSupabaseClient();
      const interests = interestsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          personal_email: personalEmail.trim() || null,
          phone: phone.trim() || null,
          hometown: hometown.trim() || null,
          bio: bio.trim() || null,
          academic_interests: interests,
        })
        .eq('id', profile.id);

      if (updateErr) throw new Error(updateErr.message);
      await refreshProfile();
      setFeedback('Profile updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `${student.user_id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', profile.id);

      await refreshProfile();
      setFeedback('Profile photo uploaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avatar upload failed.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleConfirmAcademicReview = async () => {
    setConfirmingAcademic(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/students/${student.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await getSupabaseClient().auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          verification_status: 'verified',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not confirm review');
      }
      await getSupabaseClient()
        .from('students')
        .update({ profile_reviewed_at: new Date().toISOString() })
        .eq('id', student.id);
      await refreshProfile();
      setFeedback('Academic profile review confirmed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm academic review.');
    } finally {
      setConfirmingAcademic(false);
    }
  };

  const myBadge = getBadgeForUser(student.user_id);
  const cardSurface = getUniqueCardSurfaceClass(myBadge);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage your student identity and personal directory information.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Academic Card */}
        <section className={`space-y-6 rounded-2xl border p-6 lg:col-span-5 ${cardSurface}`}>
          <div className="flex items-start gap-4">
            <div className="relative">
              <AvatarWithBadgeFrame
                src={profile.avatar_url}
                alt={profile.display_name}
                fallbackText={profile.display_name || student.full_name}
                sizeClass="h-20 w-20"
                roundedClass="rounded-2xl"
                textClass="text-xl"
                badge={myBadge}
              />
              <label
                htmlFor="avatar-upload"
                className="absolute -bottom-2 -left-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                title="Upload profile photo"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleAvatarUpload}
                  className="sr-only"
                />
              </label>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{profile.display_name}</h2>
              <p className="font-mono text-sm text-slate-600 dark:text-slate-400">{student.student_id}</p>
              <StudentBadgesLine badge={myBadge} className="mt-2" />
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Roles: {roles.map((r) => r.replace('_', ' ')).join(' · ')}
              </p>
            </div>
          </div>

          <dl className="divide-y divide-slate-100 border-t border-slate-100 text-sm dark:divide-slate-800 dark:border-slate-800">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Institution</dt>
              <dd className="font-medium text-right">{student.institution}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Department</dt>
              <dd className="font-medium text-right">{student.department?.name}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Course</dt>
              <dd className="font-medium text-right">{student.course?.name}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Batch</dt>
              <dd className="font-medium text-right">{student.batch?.name || 'Unassigned'}</dd>
            </div>
            {myBadge?.customTag && (
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500 dark:text-slate-400">Campus Tag</dt>
                <dd className="font-semibold text-right">{myBadge.customTag}</dd>
              </div>
            )}
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Verification</dt>
              <dd className="font-medium capitalize text-right">
                {student.verification_status.replace('_', ' ')}
              </dd>
            </div>
          </dl>

          {student.verification_status === 'provisioned_unverified' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
              <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                This initial Super Admin record was securely provisioned for <span className="font-mono font-semibold">{student.student_id}</span>.
                Confirm once you have reviewed your academic department and course assignment.
              </p>
              <button
                type="button"
                disabled={confirmingAcademic}
                onClick={handleConfirmAcademicReview}
                className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-amber-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-amber-900 dark:bg-amber-600"
              >
                {confirmingAcademic ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                <span>Mark Academic Profile Reviewed</span>
              </button>
            </div>
          )}
        </section>

        {/* Editable Personal Info */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
          <h2 className="text-lg font-semibold">Personal &amp; Contact Details</h2>

          {feedback && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="prof-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Display Name
                </label>
                <input
                  id="prof-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="prof-hometown" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Hometown
                </label>
                <input
                  id="prof-hometown"
                  type="text"
                  placeholder="e.g. Keonjhar, Odisha"
                  value={hometown}
                  onChange={(e) => setHometown(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="prof-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Personal Recovery Email
                </label>
                <input
                  id="prof-email"
                  type="email"
                  value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label htmlFor="prof-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Phone Number
                </label>
                <input
                  id="prof-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label htmlFor="prof-interests" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Academic Interests (comma-separated)
              </label>
              <input
                id="prof-interests"
                type="text"
                placeholder="e.g. Organic Synthesis, Analytical Chemistry, Spectroscopy"
                value={interestsInput}
                onChange={(e) => setInterestsInput(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label htmlFor="prof-bio" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Bio
              </label>
              <textarea
                id="prof-bio"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
