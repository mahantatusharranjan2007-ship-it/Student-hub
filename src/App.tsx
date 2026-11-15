import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import {
  MessagesNotificationProvider,
  useMessagesNotifications,
} from './hooks/useMessagesNotifications';
import { StudentBadgesProvider } from './hooks/useStudentBadges';
import { AvatarThumb } from './components/common/AvatarThumb';
import { LoginView } from './components/auth/LoginView';
import { ForcePasswordChangeView } from './components/auth/ForcePasswordChangeView';
import { AppShell } from './components/layout/AppShell';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { StudentHome, type StudentTab } from './components/student/StudentHome';
import { StudentDirectory } from './components/student/StudentDirectory';
import { StudentTeachers } from './components/student/StudentTeachers';
import {
  StudentMessages,
  type MessageNavigationRequest,
} from './components/student/StudentMessages';
import { StudentProfile } from './components/student/StudentProfile';
import { StudentSettings } from './components/student/StudentSettings';
import { AdminOverview, type AdminTab } from './components/admin/AdminOverview';
import { AdminRegistrationRequests } from './components/admin/AdminRegistrationRequests';
import { AdminStudents } from './components/admin/AdminStudents';
import { AdminTeachers } from './components/admin/AdminTeachers';
import { AdminAcademics } from './components/admin/AdminAcademics';
import { AdminGroups } from './components/admin/AdminGroups';
import { AdminAnnouncements } from './components/admin/AdminAnnouncements';
import { AdminModeration } from './components/admin/AdminModeration';
import { AdminAdministrators } from './components/admin/AdminAdministrators';
import { AdminSecuritySettings } from './components/admin/AdminSecuritySettings';
import { AdminAuditLogs } from './components/admin/AdminAuditLogs';
import {
  TeacherAnnouncements,
  type TeacherTab,
} from './components/teacher/TeacherAnnouncements';
import { TeacherStudentInspector } from './components/teacher/TeacherStudentInspector';
import { TeacherProfile } from './components/teacher/TeacherProfile';
import { TeacherSettings } from './components/teacher/TeacherSettings';

const AppRouter: React.FC = () => {
  const {
    loading,
    authenticated,
    mustChangePassword,
    isTeacher,
    hasAdminAccess,
    workspace,
    setWorkspace,
  } = useAuth();
  const { notificationToast, dismissToast } = useMessagesNotifications();
  const [studentTab, setStudentTab] = useState<StudentTab>('home');
  const [teacherTab, setTeacherTab] = useState<TeacherTab>('announcements');
  const [adminTab, setAdminTab] = useState<AdminTab>('overview');
  const [messageRequest, setMessageRequest] = useState<MessageNavigationRequest | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
        <Loader2 className="h-6 w-6 animate-spin text-teal-700 dark:text-teal-400" />
        <p className="mt-3 text-sm font-medium">Loading Dharanidhar University Student Hub...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <>
        <LoginView />
        <OfflineIndicator />
      </>
    );
  }

  if (mustChangePassword) {
    return (
      <>
        <ForcePasswordChangeView />
        <OfflineIndicator />
      </>
    );
  }

  const isAdminMode = !isTeacher && hasAdminAccess && workspace === 'admin';

  const handleOpenToastChat = () => {
    if (!notificationToast || isTeacher) return;
    setWorkspace('student');
    setMessageRequest({
      kind: notificationToast.kind,
      id: notificationToast.targetId,
      nonce: Date.now(),
    });
    setStudentTab('messages');
    dismissToast();
  };

  return (
    <>
      <AppShell
        studentTab={studentTab}
        setStudentTab={setStudentTab}
        teacherTab={teacherTab}
        setTeacherTab={setTeacherTab}
        adminTab={adminTab}
        setAdminTab={setAdminTab}
      >
        {isTeacher ? (
          <>
            {teacherTab === 'announcements' && <TeacherAnnouncements />}
            {teacherTab === 'students' && <TeacherStudentInspector />}
            {teacherTab === 'profile' && <TeacherProfile />}
            {teacherTab === 'settings' && <TeacherSettings />}
          </>
        ) : !isAdminMode ? (
          <>
            {studentTab === 'home' && <StudentHome onNavigate={setStudentTab} />}
            {studentTab === 'directory' && (
              <StudentDirectory
                onStartMessage={(peerUserId) => {
                  setMessageRequest({
                    kind: 'direct',
                    id: peerUserId,
                    nonce: Date.now(),
                  });
                  setStudentTab('messages');
                }}
              />
            )}
            {studentTab === 'teachers' && (
              <StudentTeachers
                onOpenAdminTeachers={
                  hasAdminAccess
                    ? () => {
                        setWorkspace('admin');
                        setAdminTab('teachers');
                      }
                    : undefined
                }
              />
            )}
            {studentTab === 'messages' && <StudentMessages initialRequest={messageRequest} />}
            {studentTab === 'profile' && <StudentProfile />}
            {studentTab === 'settings' && <StudentSettings />}
          </>
        ) : (
          <>
            {adminTab === 'overview' && <AdminOverview onNavigate={setAdminTab} />}
            {adminTab === 'requests' && <AdminRegistrationRequests />}
            {adminTab === 'students' && <AdminStudents />}
            {adminTab === 'teachers' && <AdminTeachers />}
            {adminTab === 'departments' && <AdminAcademics section="departments" />}
            {adminTab === 'courses' && <AdminAcademics section="courses" />}
            {adminTab === 'batches' && <AdminAcademics section="batches" />}
            {adminTab === 'groups' && <AdminGroups />}
            {adminTab === 'announcements' && <AdminAnnouncements />}
            {adminTab === 'moderation' && <AdminModeration />}
            {adminTab === 'administrators' && <AdminAdministrators />}
            {adminTab === 'security' && <AdminSecuritySettings />}
            {adminTab === 'audit' && <AdminAuditLogs />}
          </>
        )}
      </AppShell>

      {/* Real-Time Incoming Message Toast Notification (Students only) */}
      {!isTeacher && notificationToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-16 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-teal-200 bg-white p-3.5 shadow-lg dark:border-teal-800 dark:bg-slate-900"
        >
          <div className="flex items-start gap-3">
            <AvatarThumb
              src={notificationToast.avatarUrl}
              alt={notificationToast.title}
              fallbackText={notificationToast.senderName}
              fallbackIcon={notificationToast.kind === 'group' ? 'users' : 'initials'}
              sizeClass="h-9 w-9"
              roundedClass="rounded-xl"
            />
            <button
              type="button"
              onClick={handleOpenToastChat}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                  {notificationToast.title}
                </span>
                <span className="font-mono text-[10px] font-medium text-teal-700 dark:text-teal-400">
                  {notificationToast.kind === 'group' ? 'Group' : 'Personal'}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">
                {notificationToast.kind === 'group'
                  ? `${notificationToast.senderName}: ${notificationToast.preview}`
                  : notificationToast.preview}
              </p>
              <p className="mt-1 text-[11px] font-medium text-teal-700 dark:text-teal-400">
                Tap to open chat
              </p>
            </button>
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss notification"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <StudentBadgesProvider>
        <MessagesNotificationProvider>
          <AppRouter />
        </MessagesNotificationProvider>
      </StudentBadgesProvider>
    </AuthProvider>
  );
}
