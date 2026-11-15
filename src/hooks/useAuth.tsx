import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { getDeviceMetadata } from '../lib/device';
import {
  configureRuntimeSupabase,
  getSupabaseClient,
  isRuntimeSupabaseConfigured,
} from '../lib/supabase';
import type {
  AdminRoleRecord,
  AppRole,
  ProfileRecord,
  StudentRecord,
  SystemHealth,
  TeacherRecord,
} from '../types/database';

export type WorkspaceMode = 'student' | 'admin';
export type AccountType = 'student' | 'teacher';

interface AuthContextValue {
  loading: boolean;
  health: SystemHealth | null;
  refreshHealth: () => Promise<void>;
  authenticated: boolean;
  accountType: AccountType | null;
  student: StudentRecord | null;
  profile: ProfileRecord | null;
  teacher: TeacherRecord | null;
  roles: AppRole[];
  adminRoles: AdminRoleRecord[];
  isSuperAdmin: boolean;
  isBatchAdmin: boolean;
  isModerator: boolean;
  isTeacher: boolean;
  hasAdminAccess: boolean;
  mustChangePassword: boolean;
  workspace: WorkspaceMode;
  setWorkspace: (mode: WorkspaceMode) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  loginWithStudentId: (studentId: string, password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [teacher, setTeacher] = useState<TeacherRecord | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [adminRoles, setAdminRoles] = useState<AdminRoleRecord[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceMode>('student');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('ddu_hub_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('ddu_hub_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      if (isRuntimeSupabaseConfigured() && authenticated && profile && accountType === 'student') {
        const supabase = getSupabaseClient();
        supabase.from('profiles').update({ theme_preference: next }).eq('id', profile.id).then(() => {});
      }
      return next;
    });
  }, [accountType, authenticated, profile]);

  const refreshHealth = useCallback(async () => {
    try {
      const data = await apiRequest<SystemHealth>('/api/health', { authenticated: false });
      setHealth(data);
    } catch {
      setHealth(null);
    }
  }, []);

  const clearAuthState = useCallback(() => {
    setAuthenticated(false);
    setAccountType(null);
    setStudent(null);
    setProfile(null);
    setTeacher(null);
    setRoles([]);
    setAdminRoles([]);
    setWorkspace('student');
  }, []);

  const loadCurrentContext = useCallback(async () => {
    if (!isRuntimeSupabaseConfigured()) {
      try {
        const cfg = await apiRequest<{
          configured: boolean;
          supabaseUrl?: string;
          supabaseAnonKey?: string;
        }>('/api/public/config', { authenticated: false });
        if (cfg.configured && cfg.supabaseUrl && cfg.supabaseAnonKey) {
          configureRuntimeSupabase(cfg.supabaseUrl, cfg.supabaseAnonKey);
        }
      } catch {
        // ignore
      }
    }

    if (!isRuntimeSupabaseConfigured()) {
      clearAuthState();
      setLoading(false);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        clearAuthState();
        setLoading(false);
        return;
      }

      const me = await apiRequest<{
        accountType?: AccountType;
        student: StudentRecord | null;
        profile: ProfileRecord | null;
        teacher?: TeacherRecord | null;
        roles: AppRole[];
        adminRoles: AdminRoleRecord[];
      }>('/api/auth/me');

      const resolvedType: AccountType = me.accountType === 'teacher' || me.teacher ? 'teacher' : 'student';
      setAuthenticated(true);
      setAccountType(resolvedType);
      setStudent(me.student);
      setProfile(me.profile);
      setTeacher(me.teacher || null);
      setRoles(me.roles);
      setAdminRoles(me.adminRoles);
      if (me.profile?.theme_preference === 'dark' || me.profile?.theme_preference === 'light') {
        setTheme(me.profile.theme_preference);
      }
    } catch {
      clearAuthState();
    } finally {
      setLoading(false);
    }
  }, [clearAuthState]);

  useEffect(() => {
    refreshHealth();
    let unsubscribe: (() => void) | undefined;

    loadCurrentContext().then(() => {
      if (!isRuntimeSupabaseConfigured()) return;
      try {
        const supabase = getSupabaseClient();
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_OUT') {
            clearAuthState();
          }
        });
        unsubscribe = () => subscription.unsubscribe();
      } catch {
        // ignore
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [clearAuthState, loadCurrentContext, refreshHealth]);

  const loginWithStudentId = async (studentId: string, password: string) => {
    const device = getDeviceMetadata();
    const res = await apiRequest<{
      session: { access_token: string; refresh_token: string };
      accountType?: AccountType;
      student: StudentRecord | null;
      profile: ProfileRecord | null;
      teacher?: TeacherRecord | null;
      roles: AppRole[];
      adminRoles: AdminRoleRecord[];
    }>('/api/auth/login', {
      method: 'POST',
      authenticated: false,
      body: {
        studentId,
        password,
        deviceFingerprint: device.deviceFingerprint,
        deviceName: device.deviceName,
        platform: device.platform,
      },
    });

    if (isRuntimeSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.setSession({
        access_token: res.session.access_token,
        refresh_token: res.session.refresh_token,
      });
      if (error) {
        throw new Error(error.message);
      }
    }

    const resolvedType: AccountType = res.accountType === 'teacher' || res.teacher ? 'teacher' : 'student';
    setAuthenticated(true);
    setAccountType(resolvedType);
    setStudent(res.student);
    setProfile(res.profile);
    setTeacher(res.teacher || null);
    setRoles(res.roles);
    setAdminRoles(res.adminRoles);
    if (res.profile?.theme_preference === 'dark' || res.profile?.theme_preference === 'light') {
      setTheme(res.profile.theme_preference);
    }
    setWorkspace('student');
  };

  const signOut = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error on logout
    }
    if (isRuntimeSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    }
    clearAuthState();
  };

  const isTeacher = accountType === 'teacher' || roles.includes('teacher');
  const isSuperAdmin = !isTeacher && roles.includes('super_admin');
  const isBatchAdmin = !isTeacher && roles.includes('batch_admin');
  const isModerator = !isTeacher && roles.includes('moderator');
  const hasAdminAccess = !isTeacher && (isSuperAdmin || isBatchAdmin || isModerator);
  const mustChangePassword = isTeacher
    ? Boolean(teacher?.must_change_password)
    : Boolean(profile?.must_change_password);

  return (
    <AuthContext.Provider
      value={{
        loading,
        health,
        refreshHealth,
        authenticated,
        accountType,
        student,
        profile,
        teacher,
        roles,
        adminRoles,
        isSuperAdmin,
        isBatchAdmin,
        isModerator,
        isTeacher,
        hasAdminAccess,
        mustChangePassword,
        workspace,
        setWorkspace,
        theme,
        toggleTheme,
        loginWithStudentId,
        refreshProfile: loadCurrentContext,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
