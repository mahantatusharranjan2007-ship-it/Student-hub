import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  Loader2,
  Megaphone,
  Pin,
  Users,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { isGroupEligibleForStudent } from '../../lib/groupEligibility';
import { getSupabaseClient } from '../../lib/supabase';
import { AnnouncementActions, AnnouncementBanner } from '../common/AnnouncementAttachments';
import { AvatarThumb } from '../common/AvatarThumb';
import type { Announcement, GroupRecord } from '../../types/database';

export type StudentTab = 'home' | 'directory' | 'teachers' | 'messages' | 'profile' | 'settings';

export const StudentHome: React.FC<{
  onNavigate: (tab: StudentTab) => void;
}> = ({ onNavigate }) => {
  const { student, profile, isSuperAdmin } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    if (!student) return;
    const supabase = getSupabaseClient();
    const [{ data: annData }, { data: groupData }, { data: memberData }] = await Promise.all([
      supabase
        .from('announcements')
        .select('*, department:departments(id, name, code)')
        .eq('is_published', true)
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(12),
      supabase
        .from('groups')
        .select('*, department:departments(id, name, code)')
        .eq('is_active', true)
        .order('name'),
      supabase.from('group_members').select('group_id').eq('user_id', student.user_id),
    ]);

    const allGroups = (groupData as GroupRecord[]) || [];
    const eligibleGroups = allGroups.filter((grp) => isGroupEligibleForStudent(grp, student));
    const eligibleIds = new Set(eligibleGroups.map((g) => g.id));

    const currentMemberIds = (memberData || []).map((m) => m.group_id);
    const mismatchedMemberIds = currentMemberIds.filter((gid) => !eligibleIds.has(gid));

    if (mismatchedMemberIds.length > 0) {
      await supabase
        .from('group_members')
        .delete()
        .eq('user_id', student.user_id)
        .in('group_id', mismatchedMemberIds);
    }

    setAnnouncements((annData as Announcement[]) || []);
    setGroups(eligibleGroups);
    setJoinedGroupIds(new Set(currentMemberIds.filter((gid) => eligibleIds.has(gid))));
    setLoading(false);
  }, [student]);

  useEffect(() => {
    loadFeed();
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel('student-home-announcements')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        () => {
          loadFeed();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFeed]);

  const toggleGroupMembership = async (groupId: string) => {
    if (!student) return;
    setGroupError(null);
    const targetGroup = groups.find((g) => g.id === groupId);
    if (!joinedGroupIds.has(groupId) && !isGroupEligibleForStudent(targetGroup, student)) {
      setGroupError('You can only join groups matching your own department, course, and batch.');
      return;
    }

    setJoiningGroupId(groupId);
    const supabase = getSupabaseClient();
    try {
      if (joinedGroupIds.has(groupId)) {
        const { error: err } = await supabase
          .from('group_members')
          .delete()
          .eq('group_id', groupId)
          .eq('user_id', student.user_id);
        if (err) throw new Error(err.message);
      } else {
        const { error: err } = await supabase.from('group_members').insert({
          group_id: groupId,
          user_id: student.user_id,
          member_role: 'member',
        });
        if (err) throw new Error(err.message);
      }
      await loadFeed();
    } catch (err) {
      setGroupError(
        err instanceof Error
          ? err.message
          : 'You are not eligible to join this department group.'
      );
    } finally {
      setJoiningGroupId(null);
    }
  };

  if (!student) return null;

  return (
    <div className="space-y-8">
      {/* Academic Identity Header */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
              {student.institution} · {student.campus_location}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Welcome, {profile?.display_name || student.full_name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
                {student.student_id}
              </span>
              <span aria-hidden="true">·</span>
              <span>{student.department?.name || 'Department'}</span>
              <span aria-hidden="true">·</span>
              <span>{student.course?.name || 'Course'}</span>
              {student.batch && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{student.batch.name}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950">
              <span className="text-slate-500 dark:text-slate-400">Student Status</span>
              <p className="mt-0.5 font-semibold capitalize text-emerald-700 dark:text-emerald-400">
                {student.student_status}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950">
              <span className="text-slate-500 dark:text-slate-400">Academic Status</span>
              <p className="mt-0.5 font-semibold capitalize text-slate-900 dark:text-slate-100">
                {student.academic_status.replace('_', ' ')}
              </p>
            </div>
          </div>
        </div>

        {/* Provisioned Profile Review Notice for Initial Super Admin */}
        {student.verification_status === 'provisioned_unverified' && (
          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                  Academic Profile Review Pending
                </p>
                <p className="mt-0.5 text-xs text-amber-900 dark:text-amber-200">
                  {isSuperAdmin
                    ? 'Your Super Admin student identity (5301K24032) was securely provisioned without fabricating an official university transcript. Please review and confirm your academic details.'
                    : 'Your provisioned academic profile is awaiting review.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-amber-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-amber-900 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              <span>Review Profile</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Announcements Feed */}
        <section className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <h2 className="text-lg font-semibold tracking-tight">University Announcements</h2>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {announcements.length} notices
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
            </div>
          ) : announcements.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <BookOpen className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                No announcements published yet
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Departmental notices and university circulars will appear here in real time.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {announcements.map((item) => (
                <article key={item.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </h3>
                      {(item.category === 'promotion' || item.category === 'resource') && (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                          {item.category}
                        </span>
                      )}
                    </div>
                    {item.is_pinned && (
                      <Pin className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-label="Pinned" />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="capitalize">{item.category}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        item.priority === 'urgent'
                          ? 'font-medium text-red-700 dark:text-red-400'
                          : item.priority === 'important'
                          ? 'font-medium text-amber-700 dark:text-amber-400'
                          : ''
                      }
                    >
                      {item.priority} priority
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{item.department?.name || 'All Departments'}</span>
                    {item.author_name && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          By {item.author_name}
                          {item.author_role === 'teacher' ? ' (Faculty)' : ''}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <time className="font-mono">
                      {new Date(item.published_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </time>
                  </div>
                  <AnnouncementBanner bannerUrl={item.banner_url} title={item.title} />
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    {item.body}
                  </p>
                  <AnnouncementActions item={item} />
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Campus & Department Groups */}
        <section className="space-y-4 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <h2 className="text-lg font-semibold tracking-tight">Your Campus Groups</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('messages')}
              className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
            >
              Open Messages
            </button>
          </div>

          {groupError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {groupError}
            </div>
          )}

          <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {groups.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No active groups configured yet.
              </div>
            ) : (
              groups.map((grp) => {
                const isMember = joinedGroupIds.has(grp.id);
                return (
                  <div key={grp.id} className="flex items-start justify-between gap-4 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <AvatarThumb
                        src={grp.image_url}
                        alt={grp.name}
                        fallbackIcon="users"
                        sizeClass="h-10 w-10"
                        roundedClass="rounded-xl"
                      />
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {grp.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="capitalize">{grp.group_type.replace('_', ' ')}</span>
                          {grp.department ? ` · ${grp.department.name}` : ' · University-wide'}
                        </p>
                        {grp.description && (
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                            {grp.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={joiningGroupId === grp.id}
                      onClick={() => toggleGroupMembership(grp.id)}
                      className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        isMember
                          ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          : 'border-teal-700 bg-teal-700 text-white hover:bg-teal-800 dark:border-teal-600 dark:bg-teal-600'
                      }`}
                    >
                      {joiningGroupId === grp.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isMember ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : null}
                      <span>{isMember ? 'Joined' : 'Join'}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
