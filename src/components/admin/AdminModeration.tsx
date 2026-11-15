import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import { getSupabaseClient } from '../../lib/supabase';
import type { ModerationReport, ReportStatus } from '../../types/database';

export const AdminModeration: React.FC = () => {
  const { student } = useAuth();
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [studentMap, setStudentMap] = useState<Map<string, { name: string; studentId: string }>>(new Map());
  const [filter, setFilter] = useState<ReportStatus | 'all'>('open');
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    let query = supabase.from('moderation_reports').select('*').order('created_at', { ascending: false });
    if (filter !== 'all') {
      query = query.eq('status', filter);
    }
    const [{ data }, { data: stuRows }] = await Promise.all([
      query,
      supabase.from('students').select('user_id, full_name, student_id'),
    ]);

    const map = new Map<string, { name: string; studentId: string }>();
    (stuRows || []).forEach((s: { user_id: string; full_name: string; student_id: string }) => {
      map.set(s.user_id, { name: s.full_name, studentId: s.student_id });
    });

    setStudentMap(map);
    setReports((data as ModerationReport[]) || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const updateReportStatus = async (report: ModerationReport, status: ReportStatus, removeTargetMessage = false) => {
    if (!student) return;
    const supabase = getSupabaseClient();

    if (removeTargetMessage && report.target_type === 'message' && report.target_id) {
      await supabase
        .from('messages')
        .update({ is_flagged: true, deleted_at: new Date().toISOString() })
        .eq('id', report.target_id);
    }

    await supabase
      .from('moderation_reports')
      .update({
        status,
        resolved_by: student.user_id,
        resolved_at: status === 'resolved' || status === 'dismissed' ? new Date().toISOString() : null,
        resolution_notes: removeTargetMessage ? 'Message removed by moderator' : `Marked ${status}`,
      })
      .eq('id', report.id);

    await apiRequest('/api/admin/audit-log', {
      method: 'POST',
      body: {
        action: `MODERATION_${status.toUpperCase()}`,
        targetType: report.target_type,
        targetId: report.target_id || report.id,
        summary: `Moderation report ${report.id} marked ${status}${removeTargetMessage ? ' (target message removed)' : ''}.`,
      },
    }).catch(() => {});

    await loadReports();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Moderation</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Review student-submitted safety reports and enforce community standards.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {(['open', 'reviewing', 'resolved', 'dismissed', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filter === s
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <ShieldAlert className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-medium">No moderation reports in this queue</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {reports.map((r) => {
            const reporter = studentMap.get(r.reporter_user_id);
            const reported = r.reported_user_id ? studentMap.get(r.reported_user_id) : undefined;
            return (
              <div key={r.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold uppercase">{r.target_type}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize font-medium text-amber-700 dark:text-amber-400">{r.status}</span>
                    <span aria-hidden="true">·</span>
                    <time className="font-mono text-slate-400">
                      {new Date(r.created_at).toLocaleString('en-IN')}
                    </time>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.reason}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Reported by{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {reporter ? `${reporter.name} (${reporter.studentId})` : 'Student'}
                    </span>
                    {reported && (
                      <>
                        {' · '}Sender:{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {reported.name} ({reported.studentId})
                        </span>
                      </>
                    )}
                  </p>
                  {r.details && (
                    <p className="whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      {r.details}
                    </p>
                  )}
                  {r.resolution_notes && (
                    <p className="text-xs text-teal-700 dark:text-teal-400">
                      Resolution: {r.resolution_notes}
                    </p>
                  )}
                </div>

                {(r.status === 'open' || r.status === 'reviewing') && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {r.target_type === 'message' && r.target_id && (
                      <button
                        type="button"
                        onClick={() => updateReportStatus(r, 'resolved', true)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
                      >
                        <span>Remove Message &amp; Resolve</span>
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => updateReportStatus(r, 'resolved', false)}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Resolve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateReportStatus(r, 'dismissed', false)}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Dismiss</span>
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
