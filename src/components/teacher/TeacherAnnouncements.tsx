import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  ImagePlus,
  Link2,
  Loader2,
  Megaphone,
  Pin,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import { readFileAsBase64 } from '../../lib/fileUpload';
import { formatTeacherName } from '../../lib/teacherDisplay';
import { AnnouncementActions, AnnouncementBanner } from '../common/AnnouncementAttachments';
import type { Announcement, Department } from '../../types/database';

export type TeacherTab = 'announcements' | 'students' | 'profile' | 'settings';

function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\/.+/i.test(url.trim());
}

export const TeacherAnnouncements: React.FC = () => {
  const { teacher } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Publish form state (empty string = All Departments / Campus-wide)
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Announcement['category']>('academic');
  const [priority, setPriority] = useState<Announcement['priority']>('normal');
  const [targetDeptId, setTargetDeptId] = useState<string>('');
  const hasInitializedDept = useRef(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  // View filter & delete confirm
  const [filterMode, setFilterMode] = useState<'all' | 'mine' | 'promo_links'>('all');
  const [feedDeptFilter, setFeedDeptFilter] = useState<string>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasInitializedDept.current && teacher?.department_id) {
      hasInitializedDept.current = true;
      setTargetDeptId(teacher.department_id);
    }
  }, [teacher?.department_id]);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        announcements: Announcement[];
        departments: Department[];
      }>('/api/teacher/announcements');
      setAnnouncements(res.announcements || []);
      setDepartments(res.departments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load announcements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a valid PDF file (.pdf) for the notice.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Notice PDF must be 10 MB or smaller.');
      return;
    }
    setUploadingPdf(true);
    setError(null);
    try {
      const base64Data = await readFileAsBase64(file);
      const res = await apiRequest<{ publicUrl: string; fileName: string }>(
        '/api/teacher/announcements/upload-media',
        {
          method: 'POST',
          body: {
            kind: 'pdf',
            contentType: 'application/pdf',
            base64Data,
            fileName: file.name,
          },
        }
      );
      setPdfUrl(res.publicUrl);
      setPdfName(res.fileName || file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload notice PDF.');
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Banner picture must be PNG, JPEG, or WebP.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Banner picture must be 4 MB or smaller.');
      return;
    }
    setUploadingBanner(true);
    setError(null);
    try {
      const base64Data = await readFileAsBase64(file);
      const res = await apiRequest<{ publicUrl: string }>(
        '/api/teacher/announcements/upload-media',
        {
          method: 'POST',
          body: {
            kind: 'banner',
            contentType: file.type,
            base64Data,
            fileName: file.name,
          },
        }
      );
      setBannerUrl(res.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload banner picture.');
    } finally {
      setUploadingBanner(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await apiRequest('/api/teacher/announcements', {
        method: 'POST',
        body: {
          title: title.trim(),
          body: body.trim(),
          category,
          priority,
          targetDepartmentId: targetDeptId || null,
          externalUrl: externalUrl.trim() || null,
          linkLabel: linkLabel.trim() || null,
          pdfUrl: pdfUrl || null,
          pdfName: pdfName || null,
          bannerUrl: bannerUrl || null,
          isPinned,
        },
      });

      setTitle('');
      setBody('');
      setExternalUrl('');
      setLinkLabel('');
      setPdfUrl('');
      setPdfName('');
      setBannerUrl('');
      setIsPinned(false);
      setSuccessMsg('Announcement published to the Student Hub feed.');
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish announcement.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await apiRequest(`/api/teacher/announcements/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete announcement.');
    } finally {
      setDeletingId(null);
    }
  };

  const visibleAnnouncements = useMemo(() => {
    return announcements.filter((a) => {
      if (feedDeptFilter === 'campus_wide' && a.target_department_id !== null) {
        return false;
      }
      if (
        feedDeptFilter !== 'all' &&
        feedDeptFilter !== 'campus_wide' &&
        a.target_department_id !== feedDeptFilter
      ) {
        return false;
      }
      if (filterMode === 'mine') {
        return a.author_user_id === teacher?.user_id;
      }
      if (filterMode === 'promo_links') {
        return (
          a.category === 'promotion' ||
          a.category === 'resource' ||
          isSafeExternalUrl(a.external_url)
        );
      }
      return true;
    });
  }, [announcements, feedDeptFilter, filterMode, teacher?.user_id]);

  if (!teacher) return null;

  return (
    <div className="space-y-8">
      {/* Faculty Identity Header */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
              Dharanidhar University · Faculty Announcements Portal
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Welcome, {formatTeacherName(teacher)}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
                {teacher.teacher_id}
              </span>
              <span aria-hidden="true">·</span>
              <span>{teacher.designation}</span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-teal-700 dark:text-teal-400">
                {teacher.department?.name || 'Department Faculty'}
              </span>
              {teacher.specialization && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{teacher.specialization}</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
            <span className="text-slate-500 dark:text-slate-400">Access Scope</span>
            <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
              Announcements &amp; Profile Inspection
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {successMsg}
        </div>
      )}

      {/* Publish Announcement, Link & Promotion Form */}
      <form
        onSubmit={handlePublish}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-semibold">
              Publish Notice, Promotional Drive or Resource Link
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <label htmlFor="tch-ann-title" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Title
            </label>
            <input
              id="tch-ann-title"
              type="text"
              required
              placeholder="e.g. Organic Chemistry Lab Workshop or Webinar Link"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="tch-ann-cat" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Category
            </label>
            <select
              id="tch-ann-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as Announcement['category'])}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="academic">Academic</option>
              <option value="promotion">Promotion / Drive</option>
              <option value="resource">Study Link / Resource</option>
              <option value="event">Event / Seminar</option>
              <option value="examination">Examination</option>
              <option value="general">General</option>
              <option value="chemistry">Chemistry</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="tch-ann-prio" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Priority
            </label>
            <select
              id="tch-ann-prio"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Announcement['priority'])}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="tch-ann-dept" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Target Department
            </label>
            <select
              id="tch-ann-dept"
              value={targetDeptId}
              onChange={(e) => setTargetDeptId(e.target.value)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">All Departments (Campus-wide)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id === teacher.department_id ? `My Dept: ${d.name}` : d.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {targetDeptId === ''
                ? 'Broadcasting to all university departments.'
                : 'Targeted to the selected department.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-7">
            <label htmlFor="tch-ann-url" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              External Link URL (optional — Google Form, study notes, event registration, promotional page)
            </label>
            <div className="relative mt-1">
              <Link2 className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                id="tch-ann-url"
                type="url"
                placeholder="https://example.edu/register-or-notes"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="sm:col-span-5">
            <label htmlFor="tch-ann-label" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Link Button Label (optional)
            </label>
            <input
              id="tch-ann-label"
              type="text"
              maxLength={80}
              placeholder="e.g. Open Registration / View Notes"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>

        {/* Notice PDF & Banner Picture Upload Options */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* PDF Notice Upload */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <FileText className="h-4 w-4 text-red-700 dark:text-red-400" />
                <span>Notice PDF (Optional)</span>
              </div>
              <span className="text-[11px] text-slate-500">Max 10 MB</span>
            </div>

            {pdfUrl ? (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                  {pdfName || 'Notice.pdf'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPdfUrl('');
                    setPdfName('');
                  }}
                  aria-label="Remove uploaded PDF"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="mt-2.5 flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-teal-600 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                {uploadingPdf ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" />
                    <span>Uploading PDF...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload Notice PDF</span>
                  </>
                )}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={uploadingPdf}
                  onChange={handlePdfUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Banner Picture Upload */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <ImagePlus className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                <span>Banner Picture (Optional)</span>
              </div>
              <span className="text-[11px] text-slate-500">PNG / JPG / WebP · Max 4 MB</span>
            </div>

            {bannerUrl ? (
              <div className="relative mt-2.5 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <img
                  src={bannerUrl}
                  alt="Announcement banner preview"
                  className="h-24 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setBannerUrl('')}
                  aria-label="Remove banner picture"
                  className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-md bg-slate-950/75 px-2 text-[11px] font-medium text-white hover:bg-red-700"
                >
                  <X className="h-3 w-3" />
                  <span>Remove</span>
                </button>
              </div>
            ) : (
              <label className="mt-2.5 flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-teal-600 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                {uploadingBanner ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" />
                    <span>Uploading Banner...</span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-3.5 w-3.5" />
                    <span>Upload Banner Pic</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploadingBanner}
                  onChange={handleBannerUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="tch-ann-body" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Announcement / Promotional Details
          </label>
          <textarea
            id="tch-ann-body"
            required
            rows={3}
            placeholder="Write instructions, schedule, or promotional details for students..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            <span>Pin to top of Student Home feed</span>
          </label>

          <button
            type="submit"
            disabled={saving || uploadingPdf || uploadingBanner}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span>Publish Announcement</span>
          </button>
        </div>
      </form>

      {/* Published Announcements Feed */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <h2 className="text-lg font-semibold tracking-tight">Campus &amp; Department Announcements</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter announcements by department"
              value={feedDeptFilter}
              onChange={(e) => setFeedDeptFilter(e.target.value)}
              className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="all">All Feeds (Campus + Depts)</option>
              <option value="campus_wide">All Departments (Campus-wide)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id === teacher.department_id ? `My Dept: ${d.name}` : d.name}
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`min-h-[34px] whitespace-nowrap rounded-lg px-3 py-1 font-medium ${
                  filterMode === 'all'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                All ({announcements.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('mine')}
                className={`min-h-[34px] whitespace-nowrap rounded-lg px-3 py-1 font-medium ${
                  filterMode === 'mine'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                My Posts ({announcements.filter((a) => a.author_user_id === teacher.user_id).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('promo_links')}
                className={`min-h-[34px] whitespace-nowrap rounded-lg px-3 py-1 font-medium ${
                  filterMode === 'promo_links'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Promotions &amp; Links
              </button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <div className="p-10 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-teal-700" />
            </div>
          ) : visibleAnnouncements.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              <Megaphone className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2">No announcements match this filter.</p>
            </div>
          ) : (
            visibleAnnouncements.map((a) => {
              const isMine = a.author_user_id === teacher.user_id;
              return (
                <article
                  key={a.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {a.title}
                      </h3>
                      {a.is_pinned && (
                        <Pin className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" aria-label="Pinned" />
                      )}
                      {(a.category === 'promotion' || a.category === 'resource') && (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                          {a.category}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="capitalize">{a.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{a.priority} priority</span>
                      <span aria-hidden="true">·</span>
                      <span>{a.department?.name || 'All Departments'}</span>
                      {a.author_name && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            By {a.author_name}
                            {a.author_role === 'teacher' ? ' (Faculty)' : ''}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <time className="font-mono">
                        {new Date(a.published_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </time>
                    </div>

                    <AnnouncementBanner bannerUrl={a.banner_url} title={a.title} />

                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {a.body}
                    </p>

                    <AnnouncementActions item={a} />
                  </div>

                  {isMine && (
                    <div className="flex shrink-0 items-center gap-2">
                      {confirmDeleteId === a.id ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={deletingId === a.id}
                            onClick={() => handleDelete(a.id)}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
                          >
                            {deletingId === a.id && <Loader2 className="h-3 w-3 animate-spin" />}
                            <span>Confirm</span>
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === a.id}
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[34px] px-2 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(a.id)}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
