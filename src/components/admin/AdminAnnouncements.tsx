import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  ImagePlus,
  Link2,
  Loader2,
  Megaphone,
  Pin,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import { readFileAsBase64 } from '../../lib/fileUpload';
import { getSupabaseClient } from '../../lib/supabase';
import { AnnouncementActions, AnnouncementBanner } from '../common/AnnouncementAttachments';
import type { Announcement, Department } from '../../types/database';

export const AdminAnnouncements: React.FC = () => {
  const { student, profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Announcement['category']>('general');
  const [priority, setPriority] = useState<Announcement['priority']>('normal');
  const [deptId, setDeptId] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const [{ data: ann }, { data: depts }] = await Promise.all([
      supabase
        .from('announcements')
        .select('*, department:departments(id, name)')
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false }),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
    ]);
    setAnnouncements((ann as Announcement[]) || []);
    setDepartments((depts as Department[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
        '/api/admin/announcements/upload-media',
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
        '/api/admin/announcements/upload-media',
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
    if (!student) return;
    setSaving(true);
    setError(null);
    try {
      const cleanedUrl = externalUrl.trim();
      if (cleanedUrl && !/^https?:\/\/.+/i.test(cleanedUrl)) {
        throw new Error('External link URL must start with http:// or https://.');
      }

      const supabase = getSupabaseClient();
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        category,
        priority,
        target_department_id: deptId || null,
        author_user_id: student.user_id,
        author_name: profile?.display_name || student.full_name,
        author_role: 'admin',
        is_pinned: isPinned,
        is_published: true,
      };

      if (cleanedUrl) {
        payload.external_url = cleanedUrl;
        payload.link_label = linkLabel.trim() || 'Open Link';
      }
      if (pdfUrl) {
        payload.pdf_url = pdfUrl;
        payload.pdf_name = pdfName || 'Notice.pdf';
      }
      if (bannerUrl) {
        payload.banner_url = bannerUrl;
      }

      const { data, error: err } = await supabase
        .from('announcements')
        .insert(payload)
        .select('id, title')
        .single();

      if (err) {
        if (err.message.includes('pdf_url') || err.message.includes('banner_url')) {
          throw new Error(
            'Run database migration 008_announcement_media.sql in Supabase SQL Editor to enable PDF notice and banner picture uploads.'
          );
        }
        if (err.message.includes('external_url') || err.message.includes('promotion') || err.message.includes('resource')) {
          throw new Error(
            'Run database migration 006_teacher_portal.sql in Supabase SQL Editor to enable links, promotion, and resource announcement categories.'
          );
        }
        throw new Error(err.message);
      }

      await apiRequest('/api/admin/audit-log', {
        method: 'POST',
        body: {
          action: 'ANNOUNCEMENT_PUBLISHED',
          targetType: 'announcement',
          targetId: data.id,
          summary: `Published announcement "${data.title}".`,
        },
      }).catch(() => {});

      setTitle('');
      setBody('');
      setExternalUrl('');
      setLinkLabel('');
      setPdfUrl('');
      setPdfName('');
      setBannerUrl('');
      setIsPinned(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish announcement.');
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (a: Announcement) => {
    const supabase = getSupabaseClient();
    const { error: err } = await supabase.from('announcements').update({ is_pinned: !a.is_pinned }).eq('id', a.id);
    if (err) {
      setError(err.message);
      return;
    }
    await loadData();
  };

  const deleteAnnouncement = async (a: Announcement) => {
    setDeletingId(a.id);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data: deleted, error: delErr } = await supabase
        .from('announcements')
        .delete()
        .eq('id', a.id)
        .select('id');
      if (delErr) throw new Error(delErr.message);
      if (!deleted || deleted.length === 0) {
        throw new Error('Could not delete announcement.');
      }

      await apiRequest('/api/admin/audit-log', {
        method: 'POST',
        body: {
          action: 'ANNOUNCEMENT_DELETED',
          targetType: 'announcement',
          targetId: a.id,
          summary: `Deleted announcement "${a.title}".`,
        },
      }).catch(() => {});
      setConfirmDeleteId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete announcement.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Publish official notices to the entire university or target specific departments.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <form
        onSubmit={handlePublish}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <input
            type="text"
            required
            placeholder="Announcement Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm sm:col-span-5 dark:border-slate-700 dark:bg-slate-950"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Announcement['category'])}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="general">General</option>
            <option value="academic">Academic</option>
            <option value="examination">Examination</option>
            <option value="promotion">Promotion / Drive</option>
            <option value="resource">Study Link / Resource</option>
            <option value="chemistry">Chemistry</option>
            <option value="security">Security</option>
            <option value="event">Event</option>
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Announcement['priority'])}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent</option>
          </select>
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="relative sm:col-span-7">
            <Link2 className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="url"
              placeholder="External link URL (optional, e.g. https://...)"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <input
            type="text"
            maxLength={80}
            placeholder="Link button label (optional)"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm sm:col-span-5 dark:border-slate-700 dark:bg-slate-950"
          />
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

        <textarea
          required
          rows={3}
          placeholder="Announcement details..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            <span>Pin to top of Student Home</span>
          </label>
          <button
            type="submit"
            disabled={saving || uploadingPdf || uploadingBanner}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span>Publish Announcement</span>
          </button>
        </div>
      </form>

      <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-teal-700" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <Megaphone className="mx-auto h-7 w-7 text-slate-400" />
            <p className="mt-2">No announcements published yet.</p>
          </div>
        ) : (
          announcements.map((a) => (
            <div key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{a.title}</h2>
                  {(a.category === 'promotion' || a.category === 'resource') && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                      {a.category}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  <span className="capitalize">{a.category}</span> · {a.priority} ·{' '}
                  {a.department?.name || 'All Departments'}
                  {a.author_name ? ` · By ${a.author_name}${a.author_role === 'teacher' ? ' (Faculty)' : ''}` : ''} ·{' '}
                  <span className="font-mono">{new Date(a.published_at).toLocaleDateString('en-IN')}</span>
                </p>
                <AnnouncementBanner bannerUrl={a.banner_url} title={a.title} />
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{a.body}</p>
                <AnnouncementActions item={a} />
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => togglePin(a)}
                  className={`inline-flex min-h-[36px] items-center gap-1 text-xs font-medium ${
                    a.is_pinned ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Pin className="h-3.5 w-3.5" />
                  <span>{a.is_pinned ? 'Pinned' : 'Pin'}</span>
                </button>
                {confirmDeleteId === a.id ? (
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      disabled={deletingId === a.id}
                      onClick={() => deleteAnnouncement(a)}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
                    >
                      {deletingId === a.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      <span>Confirm</span>
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === a.id}
                      onClick={() => setConfirmDeleteId(null)}
                      className="min-h-[32px] px-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(a.id)}
                    className="inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
