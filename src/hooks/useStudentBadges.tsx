import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { apiRequest } from '../lib/api';
import type { StudentBadgeInfo } from '../types/database';

interface StudentBadgesContextValue {
  badgesByUserId: Record<string, StudentBadgeInfo>;
  loading: boolean;
  refreshBadges: () => Promise<void>;
  getBadgeForUser: (userId?: string | null) => StudentBadgeInfo | null;
}

const StudentBadgesContext = createContext<StudentBadgesContextValue>({
  badgesByUserId: {},
  loading: false,
  refreshBadges: async () => {},
  getBadgeForUser: () => null,
});

export const StudentBadgesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authenticated, mustChangePassword } = useAuth();
  const [badgesByUserId, setBadgesByUserId] = useState<Record<string, StudentBadgeInfo>>({});
  const [loading, setLoading] = useState(false);

  const refreshBadges = useCallback(async () => {
    if (!authenticated || mustChangePassword) {
      setBadgesByUserId({});
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ badges: Record<string, StudentBadgeInfo> }>(
        '/api/student-badges'
      );
      setBadgesByUserId(res.badges || {});
    } catch {
      // Non-fatal fallback: keep previous badges if offline
    } finally {
      setLoading(false);
    }
  }, [authenticated, mustChangePassword]);

  useEffect(() => {
    refreshBadges();
  }, [refreshBadges]);

  const getBadgeForUser = useCallback(
    (userId?: string | null): StudentBadgeInfo | null => {
      if (!userId) return null;
      return badgesByUserId[userId] || null;
    },
    [badgesByUserId]
  );

  return (
    <StudentBadgesContext.Provider
      value={{
        badgesByUserId,
        loading,
        refreshBadges,
        getBadgeForUser,
      }}
    >
      {children}
    </StudentBadgesContext.Provider>
  );
};

export function useStudentBadges(): StudentBadgesContextValue {
  return useContext(StudentBadgesContext);
}
