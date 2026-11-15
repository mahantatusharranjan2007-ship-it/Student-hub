import React, { useCallback, useEffect, useState } from 'react';
import { Camera, ImagePlus, Loader2, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import { getSupabaseClient } from '../../lib/supabase';
import { AvatarThumb } from '../common/AvatarThumb';
import type { Department, GroupRecord, GroupType } from '../../types/database';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadGroupImageFile(file: File, groupId?: string): Promise<string> {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type.toLowerCase())) {
    throw new Error('Please choose a PNG, JPEG, or WebP image.');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Group image must be smaller than 2 MB.');
  }

  const base64Data = await readFileAsDataUrl(file);
  const res = await apiRequest<{ publicUrl: string }>('/api/admin/groups/upload-image', {
    method: 'POST',
    body: {
      fileName: file.name,
      contentType: file.type,
      base64Data,
      groupId,
    },
  });
  return res.publicUrl;
}

export const AdminGroups: React.FC = () => {
  const { student } = useAuth();
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [groupType, setGroupType] = useState<GroupType>('department');
  const [deptId, setDeptId] = useState('');
  const [description, setDescription] = useState('');
  const [createImageUrl, setCreateImageUrl] = useState('');
  const [uploadingCreateImage, setUploadingCreateImage] = useState(false);
  const [editingImageGroupId, setEditingImageGroupId] = useState<string | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState('');
  const [uploadingGroupId, setUploadingGroupId] = useState<string | null>(null);
  const [savingImageGroupId, setSavingImageGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const [{ data: g }, { data: d }] = await Promise.all([
      supabase.from('groups').select('*, department:departments(id, name)').order('name'),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
    ]);
    const deptList = (d as Department[]) || [];
    setGroups((g as GroupRecord[]) || []);
    setDepartments(deptList);
    setDeptId((prev) => {
      if (prev && deptList.some((item) => item.id === prev)) return prev;
      return groupType === 'department' ? deptList[0]?.id || '' : '';
    });
    setLoading(false);
  }, [groupType]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreateFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploadingCreateImage(true);
    try {
      const publicUrl = await uploadGroupImageFile(file);
      setCreateImageUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload group image.');
    } finally {
      setUploadingCreateImage(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    setError(null);
    setSuccessMessage(null);

    if (groupType === 'department' && !deptId) {
      setError('Select the specific department for a Department group so only students in that department can join.');
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      const computedSlug =
        slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') ||
        name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const insertPayload: Record<string, unknown> = {
        name: name.trim(),
        slug: computedSlug,
        description: description.trim() || null,
        group_type: groupType,
        department_id: deptId || null,
        created_by: student.user_id,
      };
      if (createImageUrl.trim()) {
        insertPayload.image_url = createImageUrl.trim();
      }

      const { data, error: err } = await supabase
        .from('groups')
        .insert(insertPayload)
        .select('id, name')
        .single();

      if (err) {
        if (err.message.includes('image_url') || err.message.includes('schema cache')) {
          throw new Error(
            'Group image column is missing in Supabase. Run migration 005_group_images.sql (ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS image_url TEXT;).'
          );
        }
        throw new Error(err.message);
      }

      await apiRequest('/api/admin/audit-log', {
        method: 'POST',
        body: {
          action: 'GROUP_CREATED',
          targetType: 'group',
          targetId: data.id,
          summary: `Created campus group "${data.name}".`,
        },
      }).catch(() => {});

      setName('');
      setSlug('');
      setDescription('');
      setCreateImageUrl('');
      setSuccessMessage(`Group "${data.name}" created.`);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create group.');
    } finally {
      setSaving(false);
    }
  };

  const openEditGroupImage = (g: GroupRecord) => {
    setError(null);
    setSuccessMessage(null);
    if (editingImageGroupId === g.id) {
      setEditingImageGroupId(null);
      setEditingImageUrl('');
      return;
    }
    setEditingImageGroupId(g.id);
    setEditingImageUrl(g.image_url || '');
  };

  const handleSaveGroupImage = async (groupId: string, nextUrl: string | null) => {
    setSavingImageGroupId(groupId);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await apiRequest<{ group: { id: string; name: string; image_url: string | null } }>(
        `/api/admin/groups/${groupId}/image`,
        {
          method: 'PATCH',
          body: { imageUrl: nextUrl },
        }
      );
      setEditingImageGroupId(null);
      setEditingImageUrl('');
      setSuccessMessage(
        res.group.image_url
          ? `Updated image for "${res.group.name}".`
          : `Removed image for "${res.group.name}".`
      );
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update group image.');
    } finally {
      setSavingImageGroupId(null);
    }
  };

  const handleUploadExistingGroupImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    groupId: string
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingGroupId(groupId);
    setError(null);
    setSuccessMessage(null);
    try {
      const publicUrl = await uploadGroupImageFile(file, groupId);
      setEditingImageUrl(publicUrl);
      await handleSaveGroupImage(groupId, publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload group image.');
    } finally {
      setUploadingGroupId(null);
    }
  };

  const toggleGroup = async (g: GroupRecord) => {
    setError(null);
    setSuccessMessage(null);
    const supabase = getSupabaseClient();
    const { error: err } = await supabase.from('groups').update({ is_active: !g.is_active }).eq('id', g.id);
    if (err) {
      setError(err.message);
      return;
    }
    await apiRequest('/api/admin/audit-log', {
      method: 'POST',
      body: {
        action: 'GROUP_TOGGLED',
        targetType: 'group',
        targetId: g.id,
        summary: `Set group "${g.name}" active=${!g.is_active}.`,
      },
    }).catch(() => {});
    await loadGroups();
  };

  const handleCleanupMismatched = async () => {
    setSyncing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await apiRequest<{ removedCount: number }>('/api/admin/groups/cleanup-mismatched', {
        method: 'POST',
      });
      setSuccessMessage(
        res.removedCount > 0
          ? `Removed ${res.removedCount} cross-department or mismatched group membership(s).`
          : 'All existing group memberships already match their students’ departments.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync group memberships.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (g: GroupRecord) => {
    setDeletingId(g.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { data: deleted, error: delErr } = await supabase
        .from('groups')
        .delete()
        .eq('id', g.id)
        .select('id');

      if (delErr) throw new Error(delErr.message);
      if (!deleted || deleted.length === 0) {
        throw new Error('Could not delete group. Ensure you have administrator permissions.');
      }

      await apiRequest('/api/admin/audit-log', {
        method: 'POST',
        body: {
          action: 'GROUP_DELETED',
          targetType: 'group',
          targetId: g.id,
          summary: `Deleted campus group "${g.name}" (#${g.slug}).`,
        },
      }).catch(() => {});

      setConfirmDeleteId(null);
      setSuccessMessage(`Deleted group "${g.name}".`);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete group.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Groups</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Create groups, assign official group images, and enforce department-only group access.
          </p>
        </div>
        <button
          type="button"
          disabled={syncing}
          onClick={handleCleanupMismatched}
          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />}
          <span>Enforce Dept Access</span>
        </button>
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

      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <input
            type="text"
            required
            placeholder="Group Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
          <select
            value={groupType}
            onChange={(e) => {
              const nextType = e.target.value as GroupType;
              setGroupType(nextType);
              if (nextType === 'department' && !deptId && departments.length > 0) {
                setDeptId(departments[0].id);
              }
            }}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="official">Official</option>
            <option value="department">Department</option>
            <option value="course">Course</option>
            <option value="batch">Batch</option>
            <option value="study_circle">Study Circle</option>
          </select>
          <select
            required={groupType === 'department'}
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          >
            {groupType !== 'department' && <option value="">All Departments</option>}
            {groupType === 'department' && departments.length === 0 && (
              <option value="">Select Department</option>
            )}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-3 dark:border-slate-700 dark:bg-slate-950"
          />
          <button
            type="submit"
            disabled={saving || uploadingCreateImage}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60 sm:col-span-2 dark:bg-teal-600"
          >
            <Plus className="h-4 w-4" />
            <span>Create Group</span>
          </button>
        </div>

        {/* Admin Group Image Selection for New Group */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <AvatarThumb
            src={createImageUrl || null}
            alt={name || 'New group'}
            fallbackIcon="users"
            sizeClass="h-10 w-10"
            roundedClass="rounded-xl"
          />
          <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">
            {uploadingCreateImage ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
            )}
            <span>{uploadingCreateImage ? 'Uploading...' : 'Upload Group Image'}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleCreateFileUpload}
              className="sr-only"
            />
          </label>
          <input
            type="url"
            placeholder="Or paste group image URL (https://...)"
            value={createImageUrl}
            onChange={(e) => setCreateImageUrl(e.target.value)}
            className="min-h-[38px] min-w-[220px] flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          {createImageUrl && (
            <button
              type="button"
              onClick={() => setCreateImageUrl('')}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </form>

      <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-teal-700" />
          </div>
        ) : groups.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No campus groups found.</div>
        ) : (
          groups.map((g) => {
            const isEditingImage = editingImageGroupId === g.id;
            const isBusyImage = uploadingGroupId === g.id || savingImageGroupId === g.id;

            return (
              <div key={g.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarThumb
                      src={g.image_url}
                      alt={g.name}
                      fallbackIcon="users"
                      sizeClass="h-11 w-11"
                      roundedClass="rounded-xl"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold">{g.name}</h2>
                        <span className="font-mono text-xs text-slate-400">#{g.slug}</span>
                        {!g.is_active && <span className="text-xs text-slate-500">(Archived)</span>}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="capitalize">{g.group_type.replace('_', ' ')}</span>
                        {g.department ? ` · ${g.department.name}` : ' · University-wide'}
                        {g.description ? ` · ${g.description}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
                    <button
                      type="button"
                      onClick={() => openEditGroupImage(g)}
                      className="inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-slate-700 hover:text-teal-700 hover:underline dark:text-slate-300 dark:hover:text-teal-400"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>{g.image_url ? 'Change Image' : 'Set Image'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g)}
                      className="min-h-[36px] text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      {g.is_active ? 'Archive' : 'Activate'}
                    </button>
                    {confirmDeleteId === g.id ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={deletingId === g.id}
                          onClick={() => handleDelete(g)}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
                        >
                          {deletingId === g.id && <Loader2 className="h-3 w-3 animate-spin" />}
                          <span>Confirm</span>
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === g.id}
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[32px] px-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(g.id)}
                        className="inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {isEditingImage && (
                  <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <AvatarThumb
                      src={editingImageUrl || null}
                      alt={g.name}
                      fallbackIcon="users"
                      sizeClass="h-10 w-10"
                      roundedClass="rounded-xl"
                    />
                    <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      {uploadingGroupId === g.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                      )}
                      <span>{uploadingGroupId === g.id ? 'Uploading...' : 'Upload Photo'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={isBusyImage}
                        onChange={(e) => handleUploadExistingGroupImage(e, g.id)}
                        className="sr-only"
                      />
                    </label>
                    <input
                      type="url"
                      placeholder="Or paste image URL (https://...)"
                      value={editingImageUrl}
                      onChange={(e) => setEditingImageUrl(e.target.value)}
                      className="min-h-[36px] min-w-[200px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      disabled={isBusyImage}
                      onClick={() => handleSaveGroupImage(g.id, editingImageUrl.trim() || null)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-600"
                    >
                      {savingImageGroupId === g.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      <span>Save URL</span>
                    </button>
                    {g.image_url && (
                      <button
                        type="button"
                        disabled={isBusyImage}
                        onClick={() => handleSaveGroupImage(g.id, null)}
                        className="min-h-[36px] rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Remove
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isBusyImage}
                      onClick={() => {
                        setEditingImageGroupId(null);
                        setEditingImageUrl('');
                      }}
                      className="min-h-[36px] px-2 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
