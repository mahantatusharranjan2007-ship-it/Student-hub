import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Laptop, Loader2, LogOut, Moon, Shield, Sun } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import { getSupabaseClient } from '../../lib/supabase';
import type { DeviceSession, RegisteredDevice } from '../../types/database';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

export const StudentSettings: React.FC = () => {
  const { profile, theme, toggleTheme, refreshProfile, signOut } = useAuth();

  // Privacy state
  const [directoryVisible, setDirectoryVisible] = useState(profile?.privacy_directory_visible ?? true);
  const [showEmail, setShowEmail] = useState(profile?.privacy_show_email ?? false);
  const [showPhone, setShowPhone] = useState(profile?.privacy_show_phone ?? false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const [passErr, setPassErr] = useState<string | null>(null);

  // Devices & sessions
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);

  const loadDevices = useCallback(async () => {
    if (!profile) return;
    setLoadingDevices(true);
    const supabase = getSupabaseClient();
    const [{ data: devRows }, { data: sessRows }] = await Promise.all([
      supabase
        .from('registered_devices')
        .select('*')
        .eq('user_id', profile.id)
        .order('last_seen_at', { ascending: false }),
      supabase
        .from('device_sessions')
        .select('*, device:registered_devices(device_name, platform)')
        .eq('user_id', profile.id)
        .order('started_at', { ascending: false })
        .limit(10),
    ]);

    setDevices((devRows as RegisteredDevice[]) || []);
    setSessions((sessRows as DeviceSession[]) || []);
    setLoadingDevices(false);
  }, [profile]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleSavePrivacy = async () => {
    if (!profile) return;
    setSavingPrivacy(true);
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from('profiles')
        .update({
          privacy_directory_visible: directoryVisible,
          privacy_show_email: showEmail,
          privacy_show_phone: showPhone,
        })
        .eq('id', profile.id);
      await refreshProfile();
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassErr(null);
    setPassMsg(null);
    if (newPassword !== confirmPassword) {
      setPassErr('New passwords do not match.');
      return;
    }
    setChangingPass(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setPassMsg(res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPassErr(err instanceof Error ? err.message : 'Password change failed.');
    } finally {
      setChangingPass(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    const supabase = getSupabaseClient();
    await supabase
      .from('device_sessions')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('id', sessionId);
    await loadDevices();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Security credentials, directory privacy, appearance, and registered devices.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Appearance & Privacy */}
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6">
          <div>
            <h2 className="text-base font-semibold">Appearance &amp; App</h2>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <p className="text-sm font-medium">Color Theme</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Current mode: {theme === 'dark' ? 'Dark' : 'Light'}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Installable Web App (PWA)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Add Dharanidhar University Student Hub to your home screen.
                </p>
              </div>
              <PWAInstallButton />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <h2 className="text-base font-semibold">Directory Privacy</h2>
            </div>

            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
                <span className="text-sm">Show my profile in Student Directory</span>
                <input
                  type="checkbox"
                  checked={directoryVisible}
                  onChange={(e) => setDirectoryVisible(e.target.checked)}
                  className="h-5 w-5 accent-teal-700"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
                <span className="text-sm">Display personal email on directory card</span>
                <input
                  type="checkbox"
                  checked={showEmail}
                  onChange={(e) => setShowEmail(e.target.checked)}
                  className="h-5 w-5 accent-teal-700"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
                <span className="text-sm">Display phone number on directory card</span>
                <input
                  type="checkbox"
                  checked={showPhone}
                  onChange={(e) => setShowPhone(e.target.checked)}
                  className="h-5 w-5 accent-teal-700"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={savingPrivacy}
              onClick={handleSavePrivacy}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              {savingPrivacy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Save Privacy Settings</span>
            </button>
          </div>
        </section>

        {/* Change Password */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-semibold">Change Password</h2>
          </div>

          {passMsg && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{passMsg}</span>
            </div>
          )}
          {passErr && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {passErr}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
            <div>
              <label htmlFor="set-curr-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Current Password
              </label>
              <input
                id="set-curr-pw"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label htmlFor="set-new-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                New Password
              </label>
              <input
                id="set-new-pw"
                type="password"
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label htmlFor="set-conf-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Confirm New Password
              </label>
              <input
                id="set-conf-pw"
                type="password"
                required
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              disabled={changingPass}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              {changingPass && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Update Password</span>
            </button>
          </form>
        </section>
      </div>

      {/* Registered Devices & Sessions */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-semibold">Registered Devices &amp; Recent Sessions</h2>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out of this device</span>
          </button>
        </div>

        {loadingDevices ? (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-teal-700" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Device</th>
                  <th className="py-2.5 pr-4 font-medium">IP Address</th>
                  <th className="py-2.5 pr-4 font-medium">Started</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.length === 0 && devices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No active device sessions recorded.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                        {s.device?.device_name || 'Web Browser'}
                      </td>
                      <td className="py-3 pr-4 font-mono text-slate-600 dark:text-slate-400">
                        {s.ip_address || 'unknown'}
                      </td>
                      <td className="py-3 pr-4 font-mono text-slate-600 dark:text-slate-400">
                        {new Date(s.started_at).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={
                            s.is_active
                              ? 'font-medium text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500'
                          }
                        >
                          {s.is_active ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {s.is_active && (
                          <button
                            type="button"
                            onClick={() => handleRevokeSession(s.id)}
                            className="font-medium text-red-700 hover:underline dark:text-red-400"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
