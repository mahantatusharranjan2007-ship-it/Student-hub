import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './useAuth';
import { isGroupEligibleForStudent } from '../lib/groupEligibility';
import { getSupabaseClient } from '../lib/supabase';
import type { MessageRecord } from '../types/database';

export type ChatKind = 'direct' | 'group';

export interface ActiveChatTarget {
  kind: ChatKind;
  id: string;
}

export interface LastMessagePreview {
  content: string;
  created_at: string;
  sender_id: string;
}

export interface IncomingMessageNotification {
  id: string;
  kind: ChatKind;
  targetId: string;
  title: string;
  senderName: string;
  preview: string;
  avatarUrl?: string | null;
  createdAt: string;
}

interface MessagesNotificationContextValue {
  unreadDirectByPeer: Record<string, number>;
  unreadGroupByGroup: Record<string, number>;
  directMessageCountByPeer: Record<string, number>;
  groupMessageCountByGroup: Record<string, number>;
  latestDirectByPeer: Record<string, LastMessagePreview>;
  latestGroupByGroup: Record<string, LastMessagePreview>;
  totalDirectUnread: number;
  totalGroupUnread: number;
  totalUnread: number;
  notificationToast: IncomingMessageNotification | null;
  dismissToast: () => void;
  markDirectRead: (peerUserId: string) => Promise<void>;
  markGroupRead: (groupId: string, latestTimestamp?: string) => void;
  refreshUnread: () => Promise<void>;
  setActiveViewingTarget: (target: ActiveChatTarget | null) => void;
}

const MessagesNotificationContext = createContext<MessagesNotificationContextValue | undefined>(
  undefined
);

function getStorageKey(userId: string): string {
  return `ddu_group_last_read_v1_${userId}`;
}

function readStoredGroupTimestamps(userId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeStoredGroupTimestamps(userId: string, map: Record<string, string>) {
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(map));
  } catch {
    // Ignore storage quota issues
  }
}

export const MessagesNotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { authenticated, mustChangePassword, isTeacher, student } = useAuth();
  const [unreadDirectByPeer, setUnreadDirectByPeer] = useState<Record<string, number>>({});
  const [unreadGroupByGroup, setUnreadGroupByGroup] = useState<Record<string, number>>({});
  const [directMessageCountByPeer, setDirectMessageCountByPeer] = useState<Record<string, number>>({});
  const [groupMessageCountByGroup, setGroupMessageCountByGroup] = useState<Record<string, number>>({});
  const [latestDirectByPeer, setLatestDirectByPeer] = useState<Record<string, LastMessagePreview>>({});
  const [latestGroupByGroup, setLatestGroupByGroup] = useState<Record<string, LastMessagePreview>>({});
  const [notificationToast, setNotificationToast] = useState<IncomingMessageNotification | null>(null);

  const activeTargetRef = useRef<ActiveChatTarget | null>(null);
  const joinedGroupsMapRef = useRef<Map<string, { name: string; joinedAt: string; imageUrl: string | null }>>(
    new Map()
  );
  const toastTimerRef = useRef<number | null>(null);

  const setActiveViewingTarget = useCallback((target: ActiveChatTarget | null) => {
    activeTargetRef.current = target;
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setNotificationToast(null);
  }, []);

  const showToast = useCallback((toast: IncomingMessageNotification) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setNotificationToast(toast);
    toastTimerRef.current = window.setTimeout(() => {
      setNotificationToast(null);
      toastTimerRef.current = null;
    }, 6500);
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!authenticated || mustChangePassword || isTeacher || !student) {
      setUnreadDirectByPeer({});
      setUnreadGroupByGroup({});
      setDirectMessageCountByPeer({});
      setGroupMessageCountByGroup({});
      setLatestDirectByPeer({});
      setLatestGroupByGroup({});
      return;
    }

    const supabase = getSupabaseClient();
    const userId = student.user_id;

    try {
      const [{ data: memberRows }, { data: directUnreadRows }, { data: recentDirectRows }] =
        await Promise.all([
          supabase
            .from('group_members')
            .select('group_id, joined_at, group:groups(*)')
            .eq('user_id', userId),
          supabase
            .from('messages')
            .select('id, sender_id')
            .eq('recipient_id', userId)
            .eq('is_read', false)
            .is('deleted_at', null),
          supabase
            .from('messages')
            .select('sender_id, recipient_id, content, created_at')
            .is('group_id', null)
            .is('deleted_at', null)
            .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
            .order('created_at', { ascending: false })
            .limit(1000),
        ]);

      // 1. Direct unread counts grouped by sender
      const directCounts: Record<string, number> = {};
      (directUnreadRows || []).forEach((row: { sender_id: string }) => {
        directCounts[row.sender_id] = (directCounts[row.sender_id] || 0) + 1;
      });
      setUnreadDirectByPeer(directCounts);

      // 2. Latest direct message preview & total message count per peer
      const directPreviews: Record<string, LastMessagePreview> = {};
      const directTotals: Record<string, number> = {};
      (recentDirectRows || []).forEach(
        (m: { sender_id: string; recipient_id: string | null; content: string; created_at: string }) => {
          const peerId = m.sender_id === userId ? m.recipient_id : m.sender_id;
          if (!peerId) return;
          directTotals[peerId] = (directTotals[peerId] || 0) + 1;
          if (!directPreviews[peerId]) {
            directPreviews[peerId] = {
              content: m.content,
              created_at: m.created_at,
              sender_id: m.sender_id,
            };
          }
        }
      );
      setLatestDirectByPeer(directPreviews);
      setDirectMessageCountByPeer(directTotals);

      // 3. Joined groups & group unread counts (strictly department/course/batch eligible)
      const groupMap = new Map<string, { name: string; joinedAt: string; imageUrl: string | null }>();
      const activeGroupIds: string[] = [];
      (memberRows || []).forEach((row: { group_id: string; joined_at: string; group: unknown }) => {
        const grp = row.group as {
          id: string;
          name: string;
          image_url?: string | null;
          department_id: string | null;
          course_id: string | null;
          batch_id: string | null;
          is_active: boolean;
        } | null;
        if (grp && isGroupEligibleForStudent(grp, student)) {
          groupMap.set(grp.id, {
            name: grp.name,
            joinedAt: row.joined_at,
            imageUrl: grp.image_url || null,
          });
          activeGroupIds.push(grp.id);
        }
      });
      joinedGroupsMapRef.current = groupMap;

      if (activeGroupIds.length === 0) {
        setUnreadGroupByGroup({});
        setGroupMessageCountByGroup({});
        setLatestGroupByGroup({});
        return;
      }

      const { data: recentGroupMsgs } = await supabase
        .from('messages')
        .select('id, group_id, sender_id, content, created_at')
        .in('group_id', activeGroupIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      const storedRead = readStoredGroupTimestamps(userId);
      const groupCounts: Record<string, number> = {};
      const groupTotals: Record<string, number> = {};
      const groupPreviews: Record<string, LastMessagePreview> = {};

      (recentGroupMsgs || []).forEach(
        (m: { id: string; group_id: string | null; sender_id: string; content: string; created_at: string }) => {
          if (!m.group_id) return;
          groupTotals[m.group_id] = (groupTotals[m.group_id] || 0) + 1;
          if (!groupPreviews[m.group_id]) {
            groupPreviews[m.group_id] = {
              content: m.content,
              created_at: m.created_at,
              sender_id: m.sender_id,
            };
          }
          if (m.sender_id === userId) return;

          const baseline = storedRead[m.group_id] || groupMap.get(m.group_id)?.joinedAt;
          if (!baseline || new Date(m.created_at).getTime() > new Date(baseline).getTime()) {
            groupCounts[m.group_id] = (groupCounts[m.group_id] || 0) + 1;
          }
        }
      );

      setUnreadGroupByGroup(groupCounts);
      setGroupMessageCountByGroup(groupTotals);
      setLatestGroupByGroup(groupPreviews);
    } catch {
      // Non-fatal: background count polling will recover on next event
    }
  }, [authenticated, isTeacher, mustChangePassword, student]);

  const markDirectRead = useCallback(
    async (peerUserId: string) => {
      if (!student) return;
      setUnreadDirectByPeer((prev) => {
        if (!prev[peerUserId]) return prev;
        const next = { ...prev };
        delete next[peerUserId];
        return next;
      });

      const supabase = getSupabaseClient();
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('recipient_id', student.user_id)
        .eq('sender_id', peerUserId)
        .eq('is_read', false);
    },
    [student]
  );

  const markGroupRead = useCallback(
    (groupId: string, latestTimestamp?: string) => {
      if (!student) return;
      const existing = readStoredGroupTimestamps(student.user_id);
      const candidate = latestTimestamp || new Date().toISOString();
      const prevTs = existing[groupId];
      const nextTs =
        prevTs && new Date(prevTs).getTime() > new Date(candidate).getTime() ? prevTs : candidate;

      writeStoredGroupTimestamps(student.user_id, {
        ...existing,
        [groupId]: nextTs,
      });

      setUnreadGroupByGroup((prev) => {
        if (!prev[groupId]) return prev;
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
    },
    [student]
  );

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    if (!authenticated || mustChangePassword || isTeacher || !student) return;

    const supabase = getSupabaseClient();
    const userId = student.user_id;

    const channel = supabase
      .channel(`global-messages-notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const msg = payload.new as MessageRecord;
          if (!msg || msg.deleted_at) return;

          const isDirectToMe = msg.group_id === null && msg.recipient_id === userId;
          const isDirectFromMe = msg.group_id === null && msg.sender_id === userId;
          const isMyGroup = Boolean(msg.group_id && joinedGroupsMapRef.current.has(msg.group_id));

          if (!isDirectToMe && !isDirectFromMe && !isMyGroup) return;

          if (isDirectToMe || isDirectFromMe) {
            const peerId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id;
            if (peerId) {
              setDirectMessageCountByPeer((prev) => ({
                ...prev,
                [peerId]: (prev[peerId] || 0) + 1,
              }));
              setLatestDirectByPeer((prev) => ({
                ...prev,
                [peerId]: {
                  content: msg.content,
                  created_at: msg.created_at,
                  sender_id: msg.sender_id,
                },
              }));
            }
          } else if (msg.group_id) {
            setGroupMessageCountByGroup((prev) => ({
              ...prev,
              [msg.group_id!]: (prev[msg.group_id!] || 0) + 1,
            }));
            setLatestGroupByGroup((prev) => ({
              ...prev,
              [msg.group_id!]: {
                content: msg.content,
                created_at: msg.created_at,
                sender_id: msg.sender_id,
              },
            }));
          }

          // Ignore notifications for messages sent by self
          if (msg.sender_id === userId) return;

          const viewing = activeTargetRef.current;

          if (isDirectToMe) {
            if (viewing?.kind === 'direct' && viewing.id === msg.sender_id) {
              await markDirectRead(msg.sender_id);
              return;
            }

            setUnreadDirectByPeer((prev) => ({
              ...prev,
              [msg.sender_id]: (prev[msg.sender_id] || 0) + 1,
            }));

            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('display_name, avatar_url')
              .eq('id', msg.sender_id)
              .maybeSingle();

            const senderName = senderProfile?.display_name || 'Student';
            showToast({
              id: msg.id,
              kind: 'direct',
              targetId: msg.sender_id,
              title: senderName,
              senderName,
              preview: msg.content,
              avatarUrl: senderProfile?.avatar_url || null,
              createdAt: msg.created_at,
            });
            return;
          }

          if (isMyGroup && msg.group_id) {
            if (viewing?.kind === 'group' && viewing.id === msg.group_id) {
              markGroupRead(msg.group_id, msg.created_at);
              return;
            }

            setUnreadGroupByGroup((prev) => ({
              ...prev,
              [msg.group_id!]: (prev[msg.group_id!] || 0) + 1,
            }));

            const [{ data: senderProfile }, groupInfo] = await Promise.all([
              supabase
                .from('profiles')
                .select('display_name, avatar_url')
                .eq('id', msg.sender_id)
                .maybeSingle(),
              Promise.resolve(joinedGroupsMapRef.current.get(msg.group_id)),
            ]);

            const senderName = senderProfile?.display_name || 'Student';
            showToast({
              id: msg.id,
              kind: 'group',
              targetId: msg.group_id,
              title: groupInfo?.name || 'Group Chat',
              senderName,
              preview: msg.content,
              avatarUrl: groupInfo?.imageUrl || senderProfile?.avatar_url || null,
              createdAt: msg.created_at,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => {
          refreshUnread();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `user_id=eq.${userId}` },
        () => {
          refreshUnread();
        }
      )
      .subscribe();

    const onFocus = () => {
      refreshUnread();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, [
    authenticated,
    isTeacher,
    markDirectRead,
    markGroupRead,
    mustChangePassword,
    refreshUnread,
    showToast,
    student,
  ]);

  const totalDirectUnread = useMemo(
    () => Object.values(unreadDirectByPeer).reduce((acc, n) => acc + n, 0),
    [unreadDirectByPeer]
  );

  const totalGroupUnread = useMemo(
    () => Object.values(unreadGroupByGroup).reduce((acc, n) => acc + n, 0),
    [unreadGroupByGroup]
  );

  const totalUnread = totalDirectUnread + totalGroupUnread;

  useEffect(() => {
    document.title =
      totalUnread > 0
        ? `(${totalUnread > 99 ? '99+' : totalUnread}) DDU Student Hub`
        : 'Dharanidhar University Student Hub';
  }, [totalUnread]);

  const value = useMemo<MessagesNotificationContextValue>(
    () => ({
      unreadDirectByPeer,
      unreadGroupByGroup,
      directMessageCountByPeer,
      groupMessageCountByGroup,
      latestDirectByPeer,
      latestGroupByGroup,
      totalDirectUnread,
      totalGroupUnread,
      totalUnread,
      notificationToast,
      dismissToast,
      markDirectRead,
      markGroupRead,
      refreshUnread,
      setActiveViewingTarget,
    }),
    [
      directMessageCountByPeer,
      dismissToast,
      groupMessageCountByGroup,
      latestDirectByPeer,
      latestGroupByGroup,
      markDirectRead,
      markGroupRead,
      notificationToast,
      refreshUnread,
      setActiveViewingTarget,
      totalDirectUnread,
      totalGroupUnread,
      totalUnread,
      unreadDirectByPeer,
      unreadGroupByGroup,
    ]
  );

  return (
    <MessagesNotificationContext.Provider value={value}>
      {children}
    </MessagesNotificationContext.Provider>
  );
};

export function useMessagesNotifications(): MessagesNotificationContextValue {
  const ctx = useContext(MessagesNotificationContext);
  if (!ctx) {
    throw new Error('useMessagesNotifications must be used within a MessagesNotificationProvider');
  }
  return ctx;
}
