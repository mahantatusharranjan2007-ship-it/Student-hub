import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Flag,
  Loader2,
  MessageSquare,
  Search,
  Send,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useDeviceInfo } from '../../hooks/useDeviceMode';
import {
  useMessagesNotifications,
  type ChatKind,
} from '../../hooks/useMessagesNotifications';
import { useStudentBadges } from '../../hooks/useStudentBadges';
import { isGroupEligibleForStudent } from '../../lib/groupEligibility';
import {
  getUniqueMessageBubbleClass,
  getUniqueRowAccentClass,
} from '../../lib/studentBadges';
import { getSupabaseClient } from '../../lib/supabase';
import { AvatarThumb } from '../common/AvatarThumb';
import { AvatarWithBadgeFrame, StudentBadgesLine } from '../common/PremiumRoleBadge';
import type { GroupRecord, MessageRecord, ProfileRecord, StudentRecord } from '../../types/database';

export interface MessageNavigationRequest {
  kind: ChatKind;
  id: string;
  nonce: number;
}

type ChannelTarget =
  | { kind: 'group'; id: string; label: string; subtitle: string; avatarUrl?: string | null }
  | { kind: 'direct'; id: string; label: string; subtitle: string; avatarUrl?: string | null };

interface PeerItem {
  userId: string;
  name: string;
  studentId: string;
  avatarUrl: string | null;
}

const REPORT_REASONS = [
  'Harassment or bullying',
  'Hate speech or abusive language',
  'Spam or unwanted promotion',
  'Misinformation or impersonation',
  'Sharing private or sensitive information',
  'Other policy violation',
] as const;

function formatShortTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export const StudentMessages: React.FC<{
  initialRequest?: MessageNavigationRequest | null;
}> = ({ initialRequest }) => {
  const { student, profile } = useAuth();
  const { getBadgeForUser } = useStudentBadges();
  const { mode: deviceMode, viewportWidth } = useDeviceInfo();
  const isSplitPane = deviceMode === 'desktop' || (deviceMode === 'tablet' && viewportWidth >= 820);
  const {
    unreadDirectByPeer,
    unreadGroupByGroup,
    directMessageCountByPeer,
    groupMessageCountByGroup,
    latestDirectByPeer,
    latestGroupByGroup,
    totalDirectUnread,
    totalGroupUnread,
    markDirectRead,
    markGroupRead,
    setActiveViewingTarget,
  } = useMessagesNotifications();

  const [chatTab, setChatTab] = useState<ChatKind>('direct');
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [peers, setPeers] = useState<PeerItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTarget, setActiveTarget] = useState<ChannelTarget | null>(null);
  const [mobileShowingThread, setMobileShowingThread] = useState(false);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [senderMap, setSenderMap] = useState<Map<string, string>>(new Map());
  const [senderAvatarMap, setSenderAvatarMap] = useState<Map<string, string | null>>(new Map());
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportingMsg, setReportingMsg] = useState<MessageRecord | null>(null);
  const [reportReason, setReportReason] = useState<string>('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastHandledNonceRef = useRef<number | null>(null);
  const initializedTabRef = useRef(false);

  const loadChannels = useCallback(async () => {
    if (!student) return;
    const supabase = getSupabaseClient();
    const [{ data: memberRows }, { data: peerStudents }, { data: peerProfiles }] = await Promise.all([
      supabase
        .from('group_members')
        .select('group_id, group:groups(*)')
        .eq('user_id', student.user_id),
      supabase
        .from('students')
        .select('user_id, student_id, full_name')
        .eq('student_status', 'active')
        .neq('user_id', student.user_id)
        .order('full_name'),
      supabase.from('profiles').select('id, display_name, avatar_url'),
    ]);

    const profileMap = new Map<string, string>();
    const avatarMap = new Map<string, string | null>();
    (peerProfiles || []).forEach((p: Pick<ProfileRecord, 'id' | 'display_name' | 'avatar_url'>) => {
      profileMap.set(p.id, p.display_name);
      avatarMap.set(p.id, p.avatar_url || null);
    });
    profileMap.set(student.user_id, 'You');
    if (profile?.avatar_url) {
      avatarMap.set(student.user_id, profile.avatar_url);
    }
    setSenderMap(profileMap);
    setSenderAvatarMap(avatarMap);

    const rawMemberGroups = (memberRows || []) as Array<{ group_id: string; group: unknown }>;
    const mismatchedGroupIds: string[] = [];
    const joinedGroups: GroupRecord[] = [];

    rawMemberGroups.forEach((r) => {
      const grp = r.group as GroupRecord | null;
      if (!grp) return;
      if (isGroupEligibleForStudent(grp, student)) {
        joinedGroups.push(grp);
      } else if (grp.is_active) {
        mismatchedGroupIds.push(grp.id);
      }
    });

    if (mismatchedGroupIds.length > 0) {
      await supabase
        .from('group_members')
        .delete()
        .eq('user_id', student.user_id)
        .in('group_id', mismatchedGroupIds);
    }

    setGroups(joinedGroups);

    const peerList = ((peerStudents as Pick<StudentRecord, 'user_id' | 'student_id' | 'full_name'>[]) || []).map(
      (s) => ({
        userId: s.user_id,
        name: profileMap.get(s.user_id) || s.full_name,
        studentId: s.student_id,
        avatarUrl: avatarMap.get(s.user_id) || null,
      })
    );
    setPeers(peerList);
    setLoading(false);
  }, [profile?.avatar_url, student]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Handle explicit navigation requests (from Directory or clicking a live notification toast)
  useEffect(() => {
    if (loading || !initialRequest) return;
    if (lastHandledNonceRef.current === initialRequest.nonce) return;

    if (initialRequest.kind === 'direct') {
      const peer = peers.find((p) => p.userId === initialRequest.id);
      if (peer) {
        lastHandledNonceRef.current = initialRequest.nonce;
        setChatTab('direct');
        setActiveTarget({
          kind: 'direct',
          id: peer.userId,
          label: peer.name,
          subtitle: peer.studentId,
          avatarUrl: peer.avatarUrl,
        });
        setMobileShowingThread(true);
        initializedTabRef.current = true;
      }
    } else {
      const grp = groups.find((g) => g.id === initialRequest.id);
      if (grp) {
        lastHandledNonceRef.current = initialRequest.nonce;
        setChatTab('group');
        setActiveTarget({
          kind: 'group',
          id: grp.id,
          label: grp.name,
          subtitle: grp.group_type.replace('_', ' '),
          avatarUrl: grp.image_url || null,
        });
        setMobileShowingThread(true);
        initializedTabRef.current = true;
      }
    }
  }, [groups, initialRequest, loading, peers]);

  // On initial mount (without explicit request), pick tab with unread messages first, or Personal Chats
  useEffect(() => {
    if (loading || initializedTabRef.current || initialRequest) return;
    initializedTabRef.current = true;
    if (totalGroupUnread > 0 && totalDirectUnread === 0) {
      setChatTab('group');
    } else {
      setChatTab('direct');
    }
  }, [initialRequest, loading, totalDirectUnread, totalGroupUnread]);

  // Keep global notification context informed of what conversation is currently visible
  useEffect(() => {
    if (!activeTarget) {
      setActiveViewingTarget(null);
    } else {
      setActiveViewingTarget({ kind: activeTarget.kind, id: activeTarget.id });
    }
    return () => {
      setActiveViewingTarget(null);
    };
  }, [activeTarget, setActiveViewingTarget]);

  const loadMessages = useCallback(async () => {
    if (!student || !activeTarget) return;
    const supabase = getSupabaseClient();

    let query = supabase
      .from('messages')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(120);

    if (activeTarget.kind === 'group') {
      query = query.eq('group_id', activeTarget.id);
    } else {
      query = query.or(
        `and(sender_id.eq.${student.user_id},recipient_id.eq.${activeTarget.id}),and(sender_id.eq.${activeTarget.id},recipient_id.eq.${student.user_id})`
      );
    }

    const { data } = await query;
    const rows = (data as MessageRecord[]) || [];
    setMessages(rows);

    if (activeTarget.kind === 'direct') {
      await markDirectRead(activeTarget.id);
    } else {
      const latestTs = rows.length > 0 ? rows[rows.length - 1].created_at : undefined;
      markGroupRead(activeTarget.id, latestTs);
    }

    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [activeTarget, markDirectRead, markGroupRead, student]);

  useEffect(() => {
    loadMessages();
    if (!activeTarget) return;

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`messages-thread-${activeTarget.kind}-${activeTarget.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTarget, loadMessages]);

  const selectDirectPeer = (p: PeerItem) => {
    setSendError(null);
    setActiveTarget({
      kind: 'direct',
      id: p.userId,
      label: p.name,
      subtitle: p.studentId,
      avatarUrl: p.avatarUrl,
    });
    setMobileShowingThread(true);
    markDirectRead(p.userId);
  };

  const selectGroup = (g: GroupRecord) => {
    setSendError(null);
    setActiveTarget({
      kind: 'group',
      id: g.id,
      label: g.name,
      subtitle: g.group_type.replace('_', ' '),
      avatarUrl: g.image_url || null,
    });
    setMobileShowingThread(true);
    markGroupRead(g.id, latestGroupByGroup[g.id]?.created_at);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !activeTarget || !draft.trim()) return;
    if (activeTarget.kind === 'group') {
      const activeGroup = groups.find((g) => g.id === activeTarget.id);
      if (!isGroupEligibleForStudent(activeGroup, student)) {
        setSendError('Access restricted: you can only message groups matching your department, course, and batch.');
        return;
      }
    }
    setSending(true);
    setSendError(null);
    const supabase = getSupabaseClient();
    try {
      const payload: {
        sender_id: string;
        group_id: string | null;
        recipient_id: string | null;
        content: string;
      } =
        activeTarget.kind === 'group'
          ? {
              sender_id: student.user_id,
              group_id: activeTarget.id,
              recipient_id: null,
              content: draft.trim(),
            }
          : {
              sender_id: student.user_id,
              recipient_id: activeTarget.id,
              group_id: null,
              content: draft.trim(),
            };

      const { error } = await supabase.from('messages').insert(payload);
      if (error) {
        setSendError(error.message);
        return;
      }
      setDraft('');
      await loadMessages();
    } finally {
      setSending(false);
    }
  };

  const openReportModal = (msg: MessageRecord) => {
    setReportingMsg(msg);
    setReportReason('');
    setReportDetails('');
    setReportError(null);
  };

  const closeReportModal = () => {
    if (submittingReport) return;
    setReportingMsg(null);
    setReportReason('');
    setReportDetails('');
    setReportError(null);
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !reportingMsg) return;

    const trimmedReason = reportReason.trim();
    const trimmedDetails = reportDetails.trim();

    if (!trimmedReason) {
      setReportError('Please select a reason for reporting this message.');
      return;
    }

    if (trimmedReason === 'Other policy violation' && trimmedDetails.length < 5) {
      setReportError('Please explain why you are reporting this message (at least 5 characters).');
      return;
    }

    setSubmittingReport(true);
    setReportError(null);
    const supabase = getSupabaseClient();
    try {
      const formattedDetails = trimmedDetails
        ? `Reporter explanation: ${trimmedDetails}\nReported message: "${reportingMsg.content.slice(0, 300)}"`
        : `Reported message: "${reportingMsg.content.slice(0, 300)}"`;

      const { error } = await supabase.from('moderation_reports').insert({
        reporter_user_id: student.user_id,
        reported_user_id: reportingMsg.sender_id,
        target_type: 'message',
        target_id: reportingMsg.id,
        reason: trimmedReason,
        details: formattedDetails,
      });

      if (error) {
        throw new Error(error.message);
      }

      setReportingMsg(null);
      setReportReason('');
      setReportDetails('');
      setReportNotice('Message reported with reason to the moderation team.');
      setTimeout(() => setReportNotice(null), 5000);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const sortedPeers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return peers
      .filter((p) => {
        if (!q) return true;
        const badge = getBadgeForUser(p.userId);
        return (
          p.name.toLowerCase().includes(q) ||
          p.studentId.toLowerCase().includes(q) ||
          (badge?.customTag || '').toLowerCase().includes(q) ||
          (badge?.highestAdminRole ? badge.highestAdminRole.replace('_', ' ').toLowerCase().includes(q) : false)
        );
      })
      .sort((a, b) => {
        const unreadA = unreadDirectByPeer[a.userId] || 0;
        const unreadB = unreadDirectByPeer[b.userId] || 0;
        if (unreadA !== unreadB) return unreadB - unreadA;

        const countA = directMessageCountByPeer[a.userId] || 0;
        const countB = directMessageCountByPeer[b.userId] || 0;
        if (countA !== countB) return countB - countA;

        const timeA = latestDirectByPeer[a.userId]?.created_at
          ? new Date(latestDirectByPeer[a.userId].created_at).getTime()
          : 0;
        const timeB = latestDirectByPeer[b.userId]?.created_at
          ? new Date(latestDirectByPeer[b.userId].created_at).getTime()
          : 0;
        if (timeA !== timeB) return timeB - timeA;

        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
  }, [directMessageCountByPeer, getBadgeForUser, latestDirectByPeer, peers, searchQuery, unreadDirectByPeer]);

  const sortedGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groups
      .filter((g) => {
        if (!q) return true;
        return g.name.toLowerCase().includes(q) || g.group_type.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const unreadA = unreadGroupByGroup[a.id] || 0;
        const unreadB = unreadGroupByGroup[b.id] || 0;
        if (unreadA !== unreadB) return unreadB - unreadA;

        const countA = groupMessageCountByGroup[a.id] || 0;
        const countB = groupMessageCountByGroup[b.id] || 0;
        if (countA !== countB) return countB - countA;

        const timeA = latestGroupByGroup[a.id]?.created_at
          ? new Date(latestGroupByGroup[a.id].created_at).getTime()
          : 0;
        const timeB = latestGroupByGroup[b.id]?.created_at
          ? new Date(latestGroupByGroup[b.id].created_at).getTime()
          : 0;
        if (timeA !== timeB) return timeB - timeA;

        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
  }, [groupMessageCountByGroup, groups, latestGroupByGroup, searchQuery, unreadGroupByGroup]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 dark:border-slate-800 dark:bg-slate-900">
        <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
      </div>
    );
  }

  return (
    <div className={`grid gap-6 ${isSplitPane ? 'grid-cols-12' : 'grid-cols-1'}`}>
      {/* Sidebar Conversations (Hidden on single-pane mobile/narrow-tablet when viewing an active thread) */}
      <aside
        className={`flex flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${
          isSplitPane
            ? deviceMode === 'tablet'
              ? 'col-span-5 flex'
              : 'col-span-4 flex'
            : mobileShowingThread && activeTarget
            ? 'hidden'
            : 'flex'
        }`}
      >
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-tight">Messages</h1>
            {totalDirectUnread + totalGroupUnread > 0 && (
              <span className="font-mono text-xs font-semibold text-red-700 dark:text-red-400">
                {totalDirectUnread + totalGroupUnread} unread
              </span>
            )}
          </div>

          {/* Dedicated Personal vs Group Chat Switcher */}
          <div
            role="tablist"
            aria-label="Chat categories"
            className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chatTab === 'direct'}
              onClick={() => {
                setChatTab('direct');
                setSearchQuery('');
              }}
              className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                chatTab === 'direct'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <User className="h-3.5 w-3.5 shrink-0" />
              <span>Personal</span>
              {totalDirectUnread > 0 && (
                <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[10px] font-bold text-white">
                  {totalDirectUnread > 99 ? '99+' : totalDirectUnread}
                </span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={chatTab === 'group'}
              onClick={() => {
                setChatTab('group');
                setSearchQuery('');
              }}
              className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                chatTab === 'group'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span>Groups</span>
              {totalGroupUnread > 0 && (
                <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[10px] font-bold text-white">
                  {totalGroupUnread > 99 ? '99+' : totalGroupUnread}
                </span>
              )}
            </button>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                chatTab === 'direct' ? 'Search students by name or ID...' : 'Search joined groups...'
              }
              className="w-full min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Separate Conversation List */}
        <div
          className={`flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 ${
            isSplitPane ? 'max-h-[540px]' : 'max-h-[460px]'
          }`}
        >
          {chatTab === 'direct' ? (
            sortedPeers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                <User className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-2">
                  {peers.length === 0
                    ? 'Other active students will appear here once approved.'
                    : 'No matching students found.'}
                </p>
              </div>
            ) : (
              sortedPeers.map((p) => {
                const selected = activeTarget?.kind === 'direct' && activeTarget.id === p.userId;
                const unreadCount = unreadDirectByPeer[p.userId] || 0;
                const preview = latestDirectByPeer[p.userId];
                const peerBadge = getBadgeForUser(p.userId);
                const rowAccent = getUniqueRowAccentClass(peerBadge);
                return (
                  <button
                    key={p.userId}
                    type="button"
                    onClick={() => selectDirectPeer(p)}
                    className={`flex w-full min-h-[58px] items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-200'
                        : unreadCount > 0
                        ? 'bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/15 dark:hover:bg-red-950/30'
                        : `${rowAccent} hover:bg-slate-50 dark:hover:bg-slate-800/60`
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <AvatarWithBadgeFrame
                        src={p.avatarUrl}
                        alt={p.name}
                        fallbackText={p.name}
                        sizeClass="h-10 w-10"
                        roundedClass="rounded-xl"
                        badge={peerBadge}
                        unreadDot={unreadCount > 0}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p
                            className={`truncate text-sm ${
                              unreadCount > 0 ? 'font-bold text-slate-950 dark:text-white' : 'font-medium'
                            }`}
                          >
                            {p.name}
                          </p>
                        </div>
                        <StudentBadgesLine badge={peerBadge} compact className="mt-0.5" />
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {preview
                            ? `${preview.sender_id === student?.user_id ? 'You: ' : ''}${preview.content}`
                            : p.studentId}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {preview && (
                        <span className="font-mono text-[10px] text-slate-400">
                          {formatShortTime(preview.created_at)}
                        </span>
                      )}
                      {unreadCount > 0 && (
                        <span className="inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-red-600 px-1.5 font-mono text-[11px] font-bold text-white">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )
          ) : sortedGroups.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              <Users className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2">
                {groups.length === 0
                  ? 'Join a group from Home to participate in group chats.'
                  : 'No matching joined groups found.'}
              </p>
            </div>
          ) : (
            sortedGroups.map((g) => {
              const selected = activeTarget?.kind === 'group' && activeTarget.id === g.id;
              const unreadCount = unreadGroupByGroup[g.id] || 0;
              const preview = latestGroupByGroup[g.id];
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selectGroup(g)}
                  className={`flex w-full min-h-[56px] items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                    selected
                      ? 'bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-200'
                      : unreadCount > 0
                      ? 'bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/15 dark:hover:bg-red-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative shrink-0">
                      <AvatarThumb
                        src={g.image_url}
                        alt={g.name}
                        fallbackIcon="users"
                        sizeClass="h-10 w-10"
                        roundedClass="rounded-xl"
                      />
                      {unreadCount > 0 && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white dark:ring-slate-900" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`truncate text-sm ${
                          unreadCount > 0 ? 'font-bold text-slate-950 dark:text-white' : 'font-medium'
                        }`}
                      >
                        {g.name}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {preview
                          ? `${senderMap.get(preview.sender_id) || 'Member'}: ${preview.content}`
                          : g.group_type.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {preview && (
                      <span className="font-mono text-[10px] text-slate-400">
                        {formatShortTime(preview.created_at)}
                      </span>
                    )}
                    {unreadCount > 0 && (
                      <span className="inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-red-600 px-1.5 font-mono text-[11px] font-bold text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Active Conversation */}
      <section
        className={`flex h-[calc(100dvh-180px)] min-h-[440px] max-h-[680px] flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${
          isSplitPane
            ? deviceMode === 'tablet'
              ? 'col-span-7 flex'
              : 'col-span-8 flex'
            : mobileShowingThread && activeTarget
            ? 'flex'
            : 'hidden'
        }`}
      >
        {!activeTarget ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            {chatTab === 'direct' ? (
              <User className="h-8 w-8 text-slate-400" />
            ) : (
              <Users className="h-8 w-8 text-slate-400" />
            )}
            <p className="mt-3 text-sm font-medium">
              {chatTab === 'direct'
                ? 'Select a student from Personal Chats to start messaging'
                : 'Select a joined group from Group Chats to start messaging'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Personal chats and group chats are kept separate with independent unread counters.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5 dark:border-slate-800">
              <div className="flex min-w-0 items-center gap-3">
                {!isSplitPane && (
                  <button
                    type="button"
                    onClick={() => setMobileShowingThread(false)}
                    aria-label="Back to conversation list"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                {activeTarget.kind === 'group' ? (
                  <AvatarThumb
                    src={groups.find((g) => g.id === activeTarget.id)?.image_url ?? activeTarget.avatarUrl}
                    alt={activeTarget.label}
                    fallbackText={activeTarget.label}
                    fallbackIcon="users"
                    sizeClass="h-10 w-10"
                    roundedClass="rounded-xl"
                  />
                ) : (
                  <AvatarWithBadgeFrame
                    src={
                      peers.find((p) => p.userId === activeTarget.id)?.avatarUrl ??
                      senderAvatarMap.get(activeTarget.id) ??
                      activeTarget.avatarUrl
                    }
                    alt={activeTarget.label}
                    fallbackText={activeTarget.label}
                    sizeClass="h-10 w-10"
                    roundedClass="rounded-xl"
                    badge={getBadgeForUser(activeTarget.id)}
                  />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold">{activeTarget.label}</h2>
                    {activeTarget.kind === 'direct' && (
                      <StudentBadgesLine badge={getBadgeForUser(activeTarget.id)} compact />
                    )}
                    <span className="shrink-0 font-mono text-[11px] font-medium text-teal-700 dark:text-teal-400">
                      {activeTarget.kind === 'direct' ? 'Personal Chat' : 'Group Chat'}
                    </span>
                  </div>
                  <p className="truncate font-mono text-xs capitalize text-slate-500 dark:text-slate-400">
                    {activeTarget.subtitle}
                  </p>
                </div>
              </div>
              {reportNotice && (
                <span className="text-xs font-medium text-teal-700 dark:text-teal-400">
                  {reportNotice}
                </span>
              )}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              {messages.length === 0 ? (
                <div className="py-12 text-center">
                  <MessageSquare className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    No messages yet in this {activeTarget.kind === 'direct' ? 'personal chat' : 'group'}. Start the conversation below.
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.sender_id === student?.user_id;
                  const senderName = isMine
                    ? profile?.display_name || student?.full_name || 'You'
                    : senderMap.get(m.sender_id) || 'Student';
                  const senderAvatar = isMine
                    ? profile?.avatar_url || senderAvatarMap.get(m.sender_id) || null
                    : senderAvatarMap.get(m.sender_id) || null;
                  const senderBadge = getBadgeForUser(m.sender_id);
                  const bubbleClass = getUniqueMessageBubbleClass(senderBadge, isMine);

                  return (
                    <div
                      key={m.id}
                      className={`flex items-end gap-2.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isMine && (
                        <AvatarWithBadgeFrame
                          src={senderAvatar}
                          alt={senderName}
                          fallbackText={senderName}
                          sizeClass="h-8 w-8"
                          roundedClass="rounded-full"
                          textClass="text-[11px]"
                          badge={senderBadge}
                          className="mb-5"
                        />
                      )}

                      <div className={`flex max-w-[78%] flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        <div className={`rounded-2xl px-4 py-2.5 text-sm ${bubbleClass}`}>
                          {!isMine && (activeTarget.kind === 'group' || senderBadge) && (
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              {activeTarget.kind === 'group' && (
                                <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                                  {senderName}
                                </span>
                              )}
                              <StudentBadgesLine badge={senderBadge} compact />
                            </div>
                          )}
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        </div>
                        <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-slate-400">
                          {isMine && senderBadge && (
                            <StudentBadgesLine badge={senderBadge} compact />
                          )}
                          <time className="font-mono">
                            {new Date(m.created_at).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                          {isMine && activeTarget.kind === 'direct' && (
                            <span
                              className={`inline-flex items-center gap-0.5 ${
                                m.is_read ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400'
                              }`}
                              title={m.is_read ? 'Read' : 'Sent'}
                            >
                              {m.is_read ? (
                                <CheckCheck className="h-3.5 w-3.5" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </span>
                          )}
                          {!isMine && (
                            <button
                              type="button"
                              onClick={() => openReportModal(m)}
                              title="Report message to moderation"
                              className="inline-flex items-center gap-1 hover:text-red-600 dark:hover:text-red-400"
                            >
                              <Flag className="h-3 w-3" />
                              <span>Report</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isMine && (
                        <AvatarWithBadgeFrame
                          src={senderAvatar}
                          alt={senderName}
                          fallbackText={senderName}
                          sizeClass="h-8 w-8"
                          roundedClass="rounded-full"
                          textClass="text-[11px]"
                          badge={senderBadge}
                          className="mb-5"
                        />
                      )}
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {sendError && (
              <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {sendError}
              </div>
            )}

            <form
              onSubmit={handleSend}
              className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
            >
              <input
                type="text"
                placeholder={
                  activeTarget.kind === 'direct'
                    ? `Message ${activeTarget.label} privately...`
                    : `Message #${activeTarget.label}...`
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2000}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Send message"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </>
        )}
      </section>

      {/* Report Message Modal */}
      {reportingMsg && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-msg-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onClick={closeReportModal}
        >
          <form
            onSubmit={handleSubmitReport}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="report-msg-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Report Message
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Select a reason so the moderation team can review this report properly.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReportModal}
                aria-label="Close report modal"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <AvatarThumb
                src={senderAvatarMap.get(reportingMsg.sender_id) || null}
                alt={senderMap.get(reportingMsg.sender_id) || 'Student'}
                fallbackText={senderMap.get(reportingMsg.sender_id) || 'Student'}
                sizeClass="h-8 w-8"
                roundedClass="rounded-full"
                textClass="text-[11px]"
              />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Message from {senderMap.get(reportingMsg.sender_id) || 'Student'}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-slate-800 dark:text-slate-200">
                  &ldquo;{reportingMsg.content}&rdquo;
                </p>
              </div>
            </div>

            {reportError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                {reportError}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Reason for reporting <span className="text-red-600">*</span>
              </p>
              <div className="space-y-1.5">
                {REPORT_REASONS.map((reason) => {
                  const active = reportReason === reason;
                  return (
                    <label
                      key={reason}
                      className={`flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? 'border-red-600 bg-red-50/70 text-red-900 dark:border-red-500 dark:bg-red-950/30 dark:text-red-200'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={reason}
                        checked={active}
                        onChange={() => {
                          setReportReason(reason);
                          setReportError(null);
                        }}
                        className="h-4 w-4 accent-red-600"
                      />
                      <span>{reason}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="report-details" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Why are you reporting this?{' '}
                <span className="font-normal text-slate-500">
                  {reportReason === 'Other policy violation' ? '(Required)' : '(Optional details)'}
                </span>
              </label>
              <textarea
                id="report-details"
                rows={3}
                maxLength={500}
                placeholder="Provide clear context for moderators (what happened, why it violates guidelines)..."
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={submittingReport}
                onClick={closeReportModal}
                className="min-h-[40px] rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingReport || !reportReason}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {submittingReport ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Flag className="h-3.5 w-3.5" />
                )}
                <span>Submit Report</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
