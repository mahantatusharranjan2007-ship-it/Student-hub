import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase';
import type { AdminAuditLog } from '../../types/database';

export const AdminAuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('admin_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setLogs((data as AdminAuditLog[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filtered = logs.filter((l) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      (l.actor_student_id || '').toLowerCase().includes(q) ||
      l.summary.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Immutable chronological record of authentication, role grants, approvals, and policy updates.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Filter action or Student ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-teal-700" />
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Summary</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-500">
                    {new Date(l.created_at).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono font-semibold">{l.actor_student_id || 'system'}</span>
                    <span className="text-slate-400"> · {l.actor_role}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-teal-700 dark:text-teal-400">
                    {l.action}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{l.summary}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-500">
                    {l.ip_address || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
