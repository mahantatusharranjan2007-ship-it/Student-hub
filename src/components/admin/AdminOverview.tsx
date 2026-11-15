import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { AdminAuditLog } from '../../types/database';

export type AdminTab =
  | 'overview'
  | 'requests'
  | 'students'
  | 'teachers'
  | 'departments'
  | 'courses'
  | 'batches'
  | 'groups'
  | 'announcements'
  | 'moderation'
  | 'administrators'
  | 'security'
  | 'audit';

interface OverviewResponse {
  stats: {
    pendingRequests: number;
    totalStudents: number;
    activeStudents: number;
    departments: number;
    courses: number;
    batches: number;
    groups: number;
    announcements: number;
    openReports: number;
    activeAdmins: number;
    activeSessions: number;
  };
  recentLogs: AdminAuditLog[];
}

export const AdminOverview: React.FC<{ onNavigate: (tab: AdminTab) => void }> = ({ onNavigate }) => {
  const { student, isSuperAdmin } = useAuth();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<OverviewResponse>('/api/admin/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 dark:border-slate-800 dark:bg-slate-900">
        <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
        {error || 'Failed to load overview.'}
      </div>
    );
  }

  const metrics: Array<{ label: string; value: number; target: AdminTab; highlight?: boolean }> = [
    {
      label: 'Pending Registrations',
      value: data.stats.pendingRequests,
      target: 'requests',
      highlight: data.stats.pendingRequests > 0,
    },
    { label: 'Active Students', value: data.stats.activeStudents, target: 'students' },
    { label: 'Departments', value: data.stats.departments, target: 'departments' },
    { label: 'Courses', value: data.stats.courses, target: 'courses' },
    { label: 'Batches', value: data.stats.batches, target: 'batches' },
    { label: 'Campus Groups', value: data.stats.groups, target: 'groups' },
    {
      label: 'Open Moderation Reports',
      value: data.stats.openReports,
      target: 'moderation',
      highlight: data.stats.openReports > 0,
    },
    { label: 'Active Administrators', value: data.stats.activeAdmins, target: 'administrators' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
            Dharanidhar University · Institutional Governance
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Administration Overview</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <ShieldCheck className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          <span className="font-mono">{student?.student_id}</span>
          <span aria-hidden="true">·</span>
          <span>{isSuperAdmin ? 'Super Admin' : 'Delegated Admin'}</span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {metrics.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => onNavigate(m.target)}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-teal-600/50 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
          >
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{m.label}</span>
            <div className="mt-3 flex items-baseline justify-between">
              <span
                className={`font-mono text-2xl font-bold tabular-nums ${
                  m.highlight ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {m.value}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </button>
        ))}
      </div>

      {/* Recent Audit Activity */}
      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold">Recent Governance Audit Trail</h2>
          <button
            type="button"
            onClick={() => onNavigate('audit')}
            className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
          >
            View all logs
          </button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.recentLogs.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No audit events logged yet.</p>
          ) : (
            data.recentLogs.map((log) => (
              <div key={log.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {log.action}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-600 dark:text-slate-400">
                      {log.actor_student_id || 'system'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-500">{log.actor_role}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{log.summary}</p>
                </div>
                <time className="shrink-0 font-mono text-xs text-slate-400">
                  {new Date(log.created_at).toLocaleString('en-IN')}
                </time>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
