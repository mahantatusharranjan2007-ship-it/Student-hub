import React, { useState } from 'react';
import {
  BookOpen,
  Building2,
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  Layers,
  LayoutDashboard,
  Lock,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useDeviceMode } from '../../hooks/useDeviceMode';
import { useMessagesNotifications } from '../../hooks/useMessagesNotifications';
import { formatTeacherName } from '../../lib/teacherDisplay';
import type { AdminTab } from '../admin/AdminOverview';
import type { StudentTab } from '../student/StudentHome';
import type { TeacherTab } from '../teacher/TeacherAnnouncements';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface AppShellProps {
  studentTab: StudentTab;
  setStudentTab: (tab: StudentTab) => void;
  teacherTab: TeacherTab;
  setTeacherTab: (tab: TeacherTab) => void;
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  children: React.ReactNode;
}

const STUDENT_NAV: Array<{
  id: StudentTab;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'home', label: 'Home', shortLabel: 'Home', icon: Home },
  { id: 'directory', label: 'Directory', shortLabel: 'Directory', icon: Users },
  { id: 'teachers', label: 'Teachers', shortLabel: 'Teachers', icon: GraduationCap },
  { id: 'messages', label: 'Messages', shortLabel: 'Messages', icon: MessageSquare },
  { id: 'profile', label: 'My Profile', shortLabel: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

const TEACHER_NAV: Array<{
  id: TeacherTab;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'announcements', label: 'Announcements', shortLabel: 'Notices', icon: Megaphone },
  { id: 'students', label: 'Inspect Students', shortLabel: 'Students', icon: Users },
  { id: 'profile', label: 'My Profile', shortLabel: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

const ADMIN_NAV: Array<{
  id: AdminTab;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
  { id: 'requests', label: 'Registration requests', shortLabel: 'Requests', icon: UserCheck },
  { id: 'students', label: 'Students', shortLabel: 'Students', icon: Users },
  { id: 'teachers', label: 'Teachers', shortLabel: 'Teachers', icon: GraduationCap },
  { id: 'departments', label: 'Departments', shortLabel: 'Depts', icon: Building2 },
  { id: 'courses', label: 'Courses', shortLabel: 'Courses', icon: BookOpen },
  { id: 'batches', label: 'Batches', shortLabel: 'Batches', icon: Layers },
  { id: 'groups', label: 'Groups', shortLabel: 'Groups', icon: Users },
  { id: 'announcements', label: 'Announcements', shortLabel: 'Notices', icon: Megaphone },
  { id: 'moderation', label: 'Moderation', shortLabel: 'Moderate', icon: ShieldAlert },
  { id: 'administrators', label: 'Administrators', shortLabel: 'Admins', icon: ShieldCheck },
  { id: 'security', label: 'Security settings', shortLabel: 'Security', icon: Lock },
  { id: 'audit', label: 'Audit logs', shortLabel: 'Audit', icon: ClipboardList },
];

export const AppShell: React.FC<AppShellProps> = ({
  studentTab,
  setStudentTab,
  teacherTab,
  setTeacherTab,
  adminTab,
  setAdminTab,
  children,
}) => {
  const {
    student,
    profile,
    teacher,
    isTeacher,
    hasAdminAccess,
    isSuperAdmin,
    workspace,
    setWorkspace,
    theme,
    toggleTheme,
  } = useAuth();
  const { totalUnread } = useMessagesNotifications();
  const deviceMode = useDeviceMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isMobile = deviceMode === 'mobile';
  const isTablet = deviceMode === 'tablet';
  const isDesktop = deviceMode === 'desktop';
  const isAdminMode = !isTeacher && hasAdminAccess && workspace === 'admin';

  const navAriaLabel = isTeacher
    ? 'Faculty navigation'
    : isAdminMode
    ? 'Admin navigation'
    : 'Student navigation';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Adaptive Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div
          className={`flex h-[52px] items-center justify-between gap-2 ${
            isMobile ? 'px-3.5' : isTablet ? 'px-5' : 'px-6'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isMobile && isAdminMode && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle admin navigation"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            )}
            <GraduationCap className="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <span
              className={`truncate font-display font-bold tracking-tight whitespace-nowrap ${
                isMobile ? 'text-sm' : 'text-base'
              }`}
            >
              {isTeacher ? 'DDU Faculty Portal' : 'DDU Student Hub'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {hasAdminAccess && !isTeacher && (
              <div className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setWorkspace('student');
                    setMobileMenuOpen(false);
                  }}
                  className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    workspace === 'student'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  <span>Student</span>
                  {workspace === 'admin' && totalUnread > 0 && (
                    <span className="inline-flex min-w-[16px] h-[16px] items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[10px] font-bold text-white">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspace('admin')}
                  className={`min-h-[32px] rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    workspace === 'admin'
                      ? 'bg-teal-700 text-white shadow-sm dark:bg-teal-600'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  {isSuperAdmin && !isMobile ? 'Super Admin' : 'Admin'}
                </button>
              </div>
            )}

            <PWAInstallButton compact />

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        {/* PC / Desktop Full Sidebar */}
        {isDesktop && (
          <aside className="flex w-64 shrink-0 min-h-[calc(100vh-52px)] flex-col justify-between border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="p-4 space-y-6">
              <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                <p className="truncate text-sm font-semibold">
                  {isTeacher ? formatTeacherName(teacher) : profile?.display_name || student?.full_name}
                </p>
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {isTeacher
                    ? `${teacher?.teacher_id || ''} · ${teacher?.department?.code || 'Faculty'}`
                    : `${student?.student_id || ''} · ${student?.department?.code || 'DDU'}`}
                </p>
              </div>

              <nav aria-label={navAriaLabel} className="space-y-1">
                {isTeacher
                  ? TEACHER_NAV.map((item) => {
                      const Icon = item.icon;
                      const active = teacherTab === item.id;
                      const needsProfileDot = item.id === 'profile' && !teacher?.profile_completed;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTeacherTab(item.id)}
                          className={`flex w-full min-h-[42px] items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </span>
                          {needsProfileDot && (
                            <span
                              title="Complete your professional profile"
                              className="h-2 w-2 rounded-full bg-amber-500"
                            />
                          )}
                        </button>
                      );
                    })
                  : !isAdminMode
                  ? STUDENT_NAV.map((item) => {
                      const Icon = item.icon;
                      const active = studentTab === item.id;
                      const showBadge = item.id === 'messages' && totalUnread > 0;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setStudentTab(item.id)}
                          className={`flex w-full min-h-[42px] items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </span>
                          {showBadge && (
                            <span
                              aria-label={`${totalUnread} unread messages`}
                              className="inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-red-600 px-1.5 font-mono text-[11px] font-bold text-white"
                            >
                              {totalUnread > 99 ? '99+' : totalUnread}
                            </span>
                          )}
                        </button>
                      );
                    })
                  : ADMIN_NAV.map((item) => {
                      const Icon = item.icon;
                      const active = adminTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setAdminTab(item.id)}
                          className={`flex w-full min-h-[40px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
              </nav>
            </div>

            <div className="border-t border-slate-100 p-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <p className="font-medium text-slate-700 dark:text-slate-300">Dharanidhar University</p>
              <p>Keonjhar, Odisha, India</p>
            </div>
          </aside>
        )}

        {/* Tablet Compact Navigation Rail */}
        {isTablet && (
          <aside className="sticky top-[52px] flex h-[calc(100vh-52px)] w-[88px] shrink-0 flex-col justify-between overflow-y-auto border-r border-slate-200 bg-white px-2 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-3">
              <div className="border-b border-slate-100 pb-2 text-center dark:border-slate-800">
                <p className="truncate font-mono text-[10px] font-semibold text-teal-700 dark:text-teal-400">
                  {isTeacher
                    ? teacher?.department?.code || 'Faculty'
                    : student?.department?.code || 'DDU'}
                </p>
                <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                  {isTeacher ? teacher?.teacher_id : student?.student_id}
                </p>
              </div>

              <nav aria-label={navAriaLabel} className="space-y-1.5">
                {isTeacher
                  ? TEACHER_NAV.map((item) => {
                      const Icon = item.icon;
                      const active = teacherTab === item.id;
                      const needsProfileDot = item.id === 'profile' && !teacher?.profile_completed;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          title={item.label}
                          onClick={() => setTeacherTab(item.id)}
                          className={`flex w-full min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-medium transition-colors ${
                            active
                              ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                          }`}
                        >
                          <span className="relative inline-flex">
                            <Icon className="h-5 w-5" />
                            {needsProfileDot && (
                              <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
                            )}
                          </span>
                          <span className="max-w-full truncate">{item.shortLabel}</span>
                        </button>
                      );
                    })
                  : !isAdminMode
                  ? STUDENT_NAV.map((item) => {
                      const Icon = item.icon;
                      const active = studentTab === item.id;
                      const showBadge = item.id === 'messages' && totalUnread > 0;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          title={item.label}
                          onClick={() => setStudentTab(item.id)}
                          className={`flex w-full min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-medium transition-colors ${
                            active
                              ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                          }`}
                        >
                          <span className="relative inline-flex">
                            <Icon className="h-5 w-5" />
                            {showBadge && (
                              <span
                                aria-label={`${totalUnread} unread messages`}
                                className="absolute -right-2.5 -top-1.5 inline-flex min-w-[16px] h-[16px] items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900"
                              >
                                {totalUnread > 99 ? '99+' : totalUnread}
                              </span>
                            )}
                          </span>
                          <span className="max-w-full truncate">{item.shortLabel}</span>
                        </button>
                      );
                    })
                  : ADMIN_NAV.map((item) => {
                      const Icon = item.icon;
                      const active = adminTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          title={item.label}
                          onClick={() => setAdminTab(item.id)}
                          className={`flex w-full min-h-[50px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors ${
                            active
                              ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="max-w-full truncate">{item.shortLabel}</span>
                        </button>
                      );
                    })}
              </nav>
            </div>

            <div className="pt-3 text-center text-[10px] font-medium text-slate-400 dark:text-slate-500">
              DDU
            </div>
          </aside>
        )}

        {/* Mobile Admin Drawer */}
        {isMobile && isAdminMode && mobileMenuOpen && (
          <div className="fixed inset-0 top-[52px] z-40 bg-slate-950/50" onClick={() => setMobileMenuOpen(false)}>
            <nav
              onClick={(e) => e.stopPropagation()}
              className="h-full w-72 overflow-y-auto border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="mb-3 px-2 text-xs font-semibold text-slate-500">Administration Menu</p>
              <div className="space-y-1">
                {ADMIN_NAV.map((item) => {
                  const Icon = item.icon;
                  const active = adminTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setAdminTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${
                        active
                          ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>
        )}

        {/* Adaptive Main Content Viewport */}
        <main
          className={`min-w-0 flex-1 ${
            isMobile
              ? 'px-3.5 py-4 pb-24'
              : isTablet
              ? 'px-5 py-5 pb-8'
              : 'px-8 py-6 pb-10'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Mobile Bottom Thumb Navigation (Teacher Mode - No Chat/Groups) */}
      {isMobile && isTeacher && (
        <nav
          aria-label="Faculty mobile navigation"
          className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe dark:border-slate-800 dark:bg-slate-900/95"
        >
          <div className="grid h-16 grid-cols-4 items-center">
            {TEACHER_NAV.map((item) => {
              const Icon = item.icon;
              const active = teacherTab === item.id;
              const needsProfileDot = item.id === 'profile' && !teacher?.profile_completed;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTeacherTab(item.id)}
                  className={`flex h-full min-h-[44px] flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-tight transition-colors ${
                    active
                      ? 'text-teal-700 dark:text-teal-400'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  <span className="relative inline-flex">
                    <Icon className="h-5 w-5" />
                    {needsProfileDot && (
                      <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
                    )}
                  </span>
                  <span>{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Mobile Bottom Thumb Navigation (Student Mode) */}
      {isMobile && !isTeacher && !isAdminMode && (
        <nav
          aria-label="Mobile navigation"
          className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe dark:border-slate-800 dark:bg-slate-900/95"
        >
          <div className="grid h-16 grid-cols-6 items-center">
            {STUDENT_NAV.map((item) => {
              const Icon = item.icon;
              const active = studentTab === item.id;
              const showBadge = item.id === 'messages' && totalUnread > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStudentTab(item.id)}
                  className={`flex h-full min-h-[44px] flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-tight transition-colors ${
                    active
                      ? 'text-teal-700 dark:text-teal-400'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  <span className="relative inline-flex">
                    <Icon className="h-5 w-5" />
                    {showBadge && (
                      <span
                        aria-label={`${totalUnread} unread messages`}
                        className="absolute -right-2.5 -top-1.5 inline-flex min-w-[16px] h-[16px] items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900"
                      >
                        {totalUnread > 99 ? '99+' : totalUnread}
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate px-0.5">{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Mobile Quick Section Bar (Admin Mode) */}
      {isMobile && isAdminMode && (
        <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-md pb-safe dark:border-slate-800 dark:bg-slate-900/95">
          <span className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <FileText className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <span className="capitalize">{ADMIN_NAV.find((n) => n.id === adminTab)?.label}</span>
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="min-h-[40px] rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white dark:bg-teal-600"
          >
            Switch Section
          </button>
        </div>
      )}
    </div>
  );
};
