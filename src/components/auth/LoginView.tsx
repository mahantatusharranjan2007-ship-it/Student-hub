import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { isRuntimeSupabaseConfigured, getSupabaseConfigIssue } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useDeviceInfo } from '../../hooks/useDeviceMode';
import type { Batch, Course, Department } from '../../types/database';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

type AuthTab = 'login' | 'register' | 'reset';

export const LoginView: React.FC = () => {
  const { health, refreshHealth, loginWithStudentId, theme, toggleTheme } = useAuth();
  const { mode: deviceMode, viewportWidth } = useDeviceInfo();
  const [tab, setTab] = useState<AuthTab>('login');
  const isTwoColLogin = deviceMode === 'desktop' || (deviceMode === 'tablet' && viewportWidth >= 900);

  // Login state
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Registration request state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [regStudentId, setRegStudentId] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regDeptId, setRegDeptId] = useState('');
  const [regCourseId, setRegCourseId] = useState('');
  const [regBatchId, setRegBatchId] = useState('');
  const [regYear, setRegYear] = useState(2024);
  const [regNote, setRegNote] = useState('');
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  // Reset password state
  const [resetStudentId, setResetStudentId] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Super Admin provisioning & migration helper state
  const [provisioningToken, setProvisioningToken] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<string | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [copyingSql, setCopyingSql] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const clientReady = isRuntimeSupabaseConfigured();
  const configIssue = getSupabaseConfigIssue();
  const isConfigured =
    clientReady &&
    Boolean(health?.supabasePublicConfigured) &&
    Boolean(health?.supabaseAdminConfigured) &&
    Boolean(health?.schemaReady);

  useEffect(() => {
    if (!isConfigured) return;
    apiRequest<{ departments: Department[]; courses: Course[]; batches: Batch[] }>(
      '/api/public/academics',
      { authenticated: false }
    )
      .then((data) => {
        setDepartments(data.departments);
        setCourses(data.courses);
        setBatches(data.batches);
        if (data.departments.length > 0 && !regDeptId) {
          const firstDept = data.departments[0];
          setRegDeptId(firstDept.id);
          const firstCourse = data.courses.find((c) => c.department_id === firstDept.id);
          if (firstCourse) {
            setRegCourseId(firstCourse.id);
            const firstBatch = data.batches.find((b) => b.course_id === firstCourse.id);
            if (firstBatch) setRegBatchId(firstBatch.id);
          }
        }
      })
      .catch(() => {
        // ignore if catalog not ready
      });
  }, [isConfigured, regDeptId]);

  const filteredCourses = courses.filter((c) => c.department_id === regDeptId);
  const filteredBatches = batches.filter((b) => b.course_id === regCourseId);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!health?.supabasePublicConfigured || !health?.supabaseAdminConfigured) {
      setLoginError('Supabase environment variables are incomplete. Check the Setup Checklist.');
      return;
    }
    if (!health?.schemaReady) {
      setLoginError(
        'Database tables are not created in Supabase yet. Click "Copy Complete Migration SQL" in the Setup Checklist, run it in your Supabase SQL Editor, then click "Re-check Database".'
      );
      return;
    }
    if (!health?.superAdminProvisioned && studentId.trim().toUpperCase() === '5301K24032') {
      setLoginError(
        'Super Admin 5301K24032 has not been provisioned yet. Complete the one-time Super Admin provisioning step in the Setup Checklist first.'
      );
      return;
    }

    setLoggingIn(true);
    try {
      await loginWithStudentId(studentId, password);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleCopyMigrationSql = async () => {
    setCopyingSql(true);
    setProvisionError(null);
    try {
      const data = await apiRequest<{ sql: string }>('/api/setup/migration-sql', {
        authenticated: false,
      });
      await navigator.clipboard.writeText(data.sql);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 5000);
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'Could not copy migration SQL.');
    } finally {
      setCopyingSql(false);
    }
  };

  const handleRecheckDatabase = async () => {
    setCheckingHealth(true);
    await refreshHealth();
    setCheckingHealth(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);
    setRegSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/registration-requests', {
        method: 'POST',
        authenticated: false,
        body: {
          studentId: regStudentId,
          fullName: regFullName,
          personalEmail: regEmail,
          phone: regPhone || undefined,
          departmentId: regDeptId,
          courseId: regCourseId,
          batchId: regBatchId || undefined,
          admissionYear: regYear,
          supportingNote: regNote || undefined,
        },
      });
      setRegSuccess(res.message);
      setRegStudentId('');
      setRegFullName('');
      setRegEmail('');
      setRegPhone('');
      setRegNote('');
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Unable to submit registration request.');
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetMessage(null);
    setResetSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/request-password-reset', {
        method: 'POST',
        authenticated: false,
        body: {
          studentId: resetStudentId,
          personalEmail: resetEmail,
        },
      });
      setResetMessage(res.message);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to request password reset.');
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleProvisionSuperAdmin = async () => {
    setProvisionError(null);
    setProvisionResult(null);
    setProvisioning(true);
    try {
      const res = await apiRequest<{ message: string; studentId: string }>('/api/setup/provision-super-admin', {
        method: 'POST',
        authenticated: false,
        headers: provisioningToken ? { 'x-provisioning-token': provisioningToken } : {},
        body: {},
      });
      setProvisionResult(res.message);
      await refreshHealth();
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'Provisioning failed.');
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <GraduationCap className="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <span className="truncate font-display text-base font-bold tracking-tight whitespace-nowrap">
              Dharanidhar University Student Hub
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto grid max-w-7xl ${
          isTwoColLogin
            ? 'grid-cols-12 items-stretch gap-8 px-6 py-10'
            : deviceMode === 'tablet'
            ? 'grid-cols-1 gap-6 px-6 py-6'
            : 'grid-cols-1 gap-5 px-3.5 py-5'
        }`}
      >
        {/* Institutional Overview Panel */}
        <section
          className={`flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${
            isTwoColLogin ? 'col-span-6' : ''
          }`}
        >
          <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
            {!heroImgFailed ? (
              <img
                src="/src/assets/images/ddu_campus_hero_1794747779812.jpg"
                alt="Dharanidhar University science campus courtyard in Keonjhar, Odisha"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-900 via-slate-900 to-slate-950 p-8">
                <GraduationCap className="h-16 w-16 text-teal-400/80" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
              <p className="text-xs font-medium text-teal-300">Keonjhar · Odisha · India</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                Campus Directory, Batch Channels &amp; Academic Governance
              </h1>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Verified Student Identity
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Access is gated by your university Student ID with administrator verification and mandatory first-login credential rotation.
                </p>
              </div>
              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Real-Time Campus Hub
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Connect across departments, courses, and batches with instant announcements, directory search, and direct messaging.
                </p>
              </div>
            </div>

            {/* Live Environment & Provisioning Status */}
            {health && (!isConfigured || !health.superAdminProvisioned) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                      {!health.schemaReady
                        ? 'Action Required: Run Supabase SQL Migrations'
                        : !isConfigured
                        ? 'Supabase Configuration Incomplete'
                        : 'Ready: Provision Initial Super Admin (5301K24032)'}
                    </h3>

                    <ul className="space-y-1 font-mono text-[11px] text-amber-900 dark:text-amber-200">
                      <li>
                        1. Supabase URL &amp; Anon Key:{' '}
                        {clientReady && health.supabasePublicConfigured
                          ? 'Configured'
                          : configIssue || 'Missing or invalid'}
                      </li>
                      <li>
                        2. Service Role Key:{' '}
                        {health.supabaseAdminConfigured ? 'Configured' : 'Missing'}
                      </li>
                      <li>
                        3. Database Schema (001–003):{' '}
                        {health.schemaReady ? 'Ready' : 'Not applied yet'}
                      </li>
                      <li>
                        4. SUPER_ADMIN_INITIAL_PASSWORD:{' '}
                        {health.initialPasswordConfigured ? 'Configured' : 'Missing'}
                      </li>
                    </ul>

                    {!health.schemaReady ? (
                      <div className="space-y-2.5 text-xs text-amber-900 dark:text-amber-200">
                        <p>
                          Your Supabase keys are connected, but the database tables do not exist yet. Copy the migration SQL and run it once in your Supabase Dashboard under{' '}
                          <span className="font-semibold">SQL Editor → New Query</span>:
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyMigrationSql}
                            disabled={copyingSql}
                            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-amber-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-amber-900 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
                          >
                            {copyingSql ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : sqlCopied ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span>
                              {sqlCopied
                                ? 'Copied SQL (001–003)!'
                                : 'Copy Complete Migration SQL (001–003)'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={handleRecheckDatabase}
                            disabled={checkingHealth}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100/60 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${checkingHealth ? 'animate-spin' : ''}`} />
                            <span>Re-check Database</span>
                          </button>
                        </div>
                      </div>
                    ) : isConfigured ? (
                      <div className="space-y-3 text-xs text-amber-900 dark:text-amber-200">
                        <p>
                          Database schema is verified. Run the one-time server provisioning to create the initial Super Admin student account (
                          <span className="font-mono font-semibold">5301K24032</span> · B.Sc. Chemistry).
                        </p>
                        {health.provisioningTokenRequired && (
                          <input
                            type="password"
                            placeholder="Enter PROVISIONING_ADMIN_TOKEN"
                            value={provisioningToken}
                            onChange={(e) => setProvisioningToken(e.target.value)}
                            className="w-full min-h-[40px] rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                          />
                        )}
                        <button
                          type="button"
                          onClick={handleProvisionSuperAdmin}
                          disabled={provisioning || !health.initialPasswordConfigured}
                          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-amber-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-amber-900 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
                        >
                          {provisioning ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {provisioning ? 'Provisioning...' : 'Run One-Time Super Admin Provisioning'}
                          </span>
                        </button>
                        {!health.initialPasswordConfigured && (
                          <p className="text-[11px] text-amber-800 dark:text-amber-300">
                            Set SUPER_ADMIN_INITIAL_PASSWORD (10+ characters) in server environment variables first.
                          </p>
                        )}
                      </div>
                    ) : null}

                    {provisionResult && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>{provisionResult}</span>
                      </p>
                    )}
                    {provisionError && (
                      <p className="text-xs font-medium text-red-700 dark:text-red-300">{provisionError}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Authentication & Registration Panel */}
        <section
          className={`flex flex-col justify-between rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${
            isTwoColLogin ? 'col-span-6 p-8' : deviceMode === 'tablet' ? 'p-7' : 'p-5'
          }`}
        >
          <div>
            {/* Segmented Mode Selector */}
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setTab('login')}
                className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                  tab === 'login'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {deviceMode === 'mobile' ? 'Sign In' : 'Student / Faculty Sign In'}
              </button>
              <button
                type="button"
                onClick={() => setTab('register')}
                className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                  tab === 'register'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {deviceMode === 'mobile' ? 'Register' : 'Request Access'}
              </button>
              <button
                type="button"
                onClick={() => setTab('reset')}
                className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                  tab === 'reset'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {deviceMode === 'mobile' ? 'Reset' : 'Reset Password'}
              </button>
            </div>

            {/* Tab 1: Login */}
            {tab === 'login' && (
              <form onSubmit={handleLogin} className="mt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Sign in with Student or Teacher ID</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Enter your Dharanidhar University Student ID or Faculty Teacher ID and password.
                  </p>
                </div>

                {loginError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                  >
                    {loginError}
                  </div>
                )}

                <div>
                  <label htmlFor="login-student-id" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Student or Teacher ID
                  </label>
                  <input
                    id="login-student-id"
                    type="text"
                    required
                    autoComplete="username"
                    placeholder="e.g. 5301K24032 or TCH-CHEM-01"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loggingIn}
                  className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  {loggingIn ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{loggingIn ? 'Authenticating...' : 'Sign In'}</span>
                </button>
              </form>
            )}

            {/* Tab 2: Student Registration Request */}
            {tab === 'register' && (
              <form onSubmit={handleRegister} className="mt-6 space-y-4">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Student Access Request</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Submit your academic details for administrator verification. Public registration creates student accounts only.
                  </p>
                </div>

                {regError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                  >
                    {regError}
                  </div>
                )}

                {regSuccess && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {regSuccess}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-id" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      University Student ID
                    </label>
                    <input
                      id="reg-id"
                      type="text"
                      required
                      placeholder="e.g. 5301K24045"
                      value={regStudentId}
                      onChange={(e) => setRegStudentId(e.target.value.toUpperCase())}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Full Name
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      required
                      placeholder="As per university roll"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Personal Email
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Phone Number (optional)
                    </label>
                    <input
                      id="reg-phone"
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-dept" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Department
                    </label>
                    <select
                      id="reg-dept"
                      required
                      value={regDeptId}
                      onChange={(e) => {
                        const deptId = e.target.value;
                        setRegDeptId(deptId);
                        const firstCourse = courses.find((c) => c.department_id === deptId);
                        setRegCourseId(firstCourse?.id || '');
                        const firstBatch = firstCourse
                          ? batches.find((b) => b.course_id === firstCourse.id)
                          : undefined;
                        setRegBatchId(firstBatch?.id || '');
                      }}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    >
                      {departments.length === 0 && <option value="">No departments loaded</option>}
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="reg-course" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Course
                    </label>
                    <select
                      id="reg-course"
                      required
                      value={regCourseId}
                      onChange={(e) => {
                        const cid = e.target.value;
                        setRegCourseId(cid);
                        const firstBatch = batches.find((b) => b.course_id === cid);
                        setRegBatchId(firstBatch?.id || '');
                      }}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    >
                      {filteredCourses.length === 0 && <option value="">Select department first</option>}
                      {filteredCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-batch" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Batch
                    </label>
                    <select
                      id="reg-batch"
                      value={regBatchId}
                      onChange={(e) => setRegBatchId(e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="">Assign on approval</option>
                      {filteredBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} · Sec {b.section}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="reg-year" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Admission Year
                    </label>
                    <input
                      id="reg-year"
                      type="number"
                      min={2000}
                      max={2035}
                      required
                      value={regYear}
                      onChange={(e) => setRegYear(Number(e.target.value))}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-note" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Verification Note (optional)
                  </label>
                  <input
                    id="reg-note"
                    type="text"
                    placeholder="Roll number or department verification note"
                    value={regNote}
                    onChange={(e) => setRegNote(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>

                <button
                  type="submit"
                  disabled={regSubmitting || !isConfigured}
                  className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  {regSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{regSubmitting ? 'Submitting...' : 'Submit Registration Request'}</span>
                </button>
              </form>
            )}

            {/* Tab 3: Password Reset */}
            {tab === 'reset' && (
              <form onSubmit={handleResetRequest} className="mt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Reset Account Password</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Enter your Student or Teacher ID and the personal email stored on your account. If no personal email is linked yet, contact a Super Admin to issue a one-time reset.
                  </p>
                </div>

                {resetError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                  >
                    {resetError}
                  </div>
                )}

                {resetMessage && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {resetMessage}
                  </div>
                )}

                <div>
                  <label htmlFor="reset-id" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Student or Teacher ID
                  </label>
                  <input
                    id="reset-id"
                    type="text"
                    required
                    value={resetStudentId}
                    onChange={(e) => setResetStudentId(e.target.value.toUpperCase())}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Registered Personal Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>

                <button
                  type="submit"
                  disabled={resetSubmitting || !isConfigured}
                  className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  {resetSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{resetSubmitting ? 'Submitting...' : 'Request Password Reset'}</span>
                </button>
              </form>
            )}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>Dharanidhar University · Student Hub</span>
            <button
              type="button"
              onClick={() => setTab(tab === 'login' ? 'register' : 'login')}
              className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline dark:text-teal-400"
            >
              <span>{tab === 'login' ? 'New student? Request access' : 'Back to sign in'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};
