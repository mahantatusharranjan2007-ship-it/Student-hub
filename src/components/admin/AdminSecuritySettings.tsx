import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save, Shield } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import { getSupabaseClient } from '../../lib/supabase';
import type { DeviceSession, SecuritySettings } from '../../types/database';

export const AdminSecuritySettings: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const [{ data: sec }, { data: sess }] = await Promise.all([
      supabase.from('security_settings').select('*').eq('id', 1).single(),
      supabase
        .from('device_sessions')
        .select('*, device:registered_devices(device_name, platform)')
        .eq('is_active', true)
        .order('started_at', { ascending: false })
        .limit(25),
    ]);
    setSettings((sec as SecuritySettings) || null);
    setSessions((sess as DeviceSession[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ settings: SecuritySettings }>('/api/admin/security-settings', {
        method: 'PUT',
        body: settings,
      });
      setSettings(res.settings);
      setFeedback('Institutional security settings updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save security settings.');
    } finally {
      setSaving(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    await apiRequest(`/api/admin/sessions/${sessionId}/revoke`, { method: 'POST' });
    await loadData();
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 dark:border-slate-800 dark:bg-slate-900">
        <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Settings</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Enforce password complexity, first-login credential rotation, and active device sessions.
        </p>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          <h2 className="text-base font-semibold">Platform Policy Controls</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Minimum Password Length
            </label>
            <input
              type="number"
              min={8}
              max={64}
              disabled={!isSuperAdmin}
              value={settings.min_password_length}
              onChange={(e) =>
                setSettings({ ...settings, min_password_length: Number(e.target.value) })
              }
              className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Max Devices per Student
            </label>
            <input
              type="number"
              min={1}
              max={20}
              disabled={!isSuperAdmin}
              value={settings.max_devices_per_student}
              onChange={(e) =>
                setSettings({ ...settings, max_devices_per_student: Number(e.target.value) })
              }
              className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Session Timeout (Hours)
            </label>
            <input
              type="number"
              min={1}
              max={720}
              disabled={!isSuperAdmin}
              value={settings.session_timeout_hours}
              onChange={(e) =>
                setSettings({ ...settings, session_timeout_hours: Number(e.target.value) })
              }
              className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm">Require administrator approval for new registrations</span>
            <input
              type="checkbox"
              disabled={!isSuperAdmin}
              checked={settings.require_admin_approval}
              onChange={(e) => setSettings({ ...settings, require_admin_approval: e.target.checked })}
              className="h-5 w-5 accent-teal-700"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm">Enforce password change on first login</span>
            <input
              type="checkbox"
              disabled={!isSuperAdmin}
              checked={settings.enforce_first_login_password_change}
              onChange={(e) =>
                setSettings({ ...settings, enforce_first_login_password_change: e.target.checked })
              }
              className="h-5 w-5 accent-teal-700"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm">Allow student-to-student direct messaging</span>
            <input
              type="checkbox"
              disabled={!isSuperAdmin}
              checked={settings.allow_student_direct_messages}
              onChange={(e) =>
                setSettings({ ...settings, allow_student_direct_messages: e.target.checked })
              }
              className="h-5 w-5 accent-teal-700"
            />
          </label>
        </div>

        {isSuperAdmin && (
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>Save Security Policy</span>
          </button>
        )}
      </form>

      {/* Active Sessions across platform */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold">Active Device Sessions</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                <th className="py-2.5 pr-4 font-medium">Device</th>
                <th className="py-2.5 pr-4 font-medium">IP Address</th>
                <th className="py-2.5 pr-4 font-medium">Started</th>
                <th className="py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    No active sessions.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 pr-4 font-medium">{s.device?.device_name || 'Browser'}</td>
                    <td className="py-3 pr-4 font-mono text-slate-600 dark:text-slate-400">
                      {s.ip_address || 'unknown'}
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-600 dark:text-slate-400">
                      {new Date(s.started_at).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 text-right">
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => revokeSession(s.id)}
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
      </section>
    </div>
  );
};
