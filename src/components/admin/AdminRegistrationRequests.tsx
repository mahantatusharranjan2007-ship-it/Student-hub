import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, UserCheck, X } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { getSupabaseClient } from '../../lib/supabase';
import type { RegistrationRequest, RegistrationStatus } from '../../types/database';

export const AdminRegistrationRequests: React.FC = () => {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<RegistrationStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [issuedCredentials, setIssuedCredentials] = useState<{
    studentId: string;
    temporaryPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    let query = supabase
      .from('registration_requests')
      .select(
        '*, department:departments(id, name, code), course:courses(id, name, code), batch:batches(id, name)'
      )
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
    } else {
      setRequests((data as RegistrationRequest[]) || []);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApprove = async (reqItem: RegistrationRequest) => {
    setProcessingId(reqItem.id);
    setError(null);
    try {
      const res = await apiRequest<{
        student: { student_id: string };
        temporaryPassword: string;
      }>(`/api/admin/registration-requests/${reqItem.id}/approve`, {
        method: 'POST',
      });
      setIssuedCredentials({
        studentId: res.student.student_id,
        temporaryPassword: res.temporaryPassword,
      });
      setCopied(false);
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (reqItem: RegistrationRequest) => {
    const reason = window.prompt(`Enter rejection reason for ${reqItem.student_id}:`, 'Unable to verify enrollment details');
    if (reason === null) return;
    setProcessingId(reqItem.id);
    setError(null);
    try {
      await apiRequest(`/api/admin/registration-requests/${reqItem.id}/reject`, {
        method: 'POST',
        body: { reason },
      });
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const copyPassword = async () => {
    if (!issuedCredentials) return;
    await navigator.clipboard.writeText(
      `Student ID: ${issuedCredentials.studentId}\nTemporary Password: ${issuedCredentials.temporaryPassword}`
    );
    setCopied(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registration Requests</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Verify student enrollment claims and provision Supabase Auth credentials upon approval.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                statusFilter === status
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {issuedCredentials && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                Student Approved — One-Time Temporary Password Generated
              </h2>
              <p className="mt-1 text-xs text-emerald-900 dark:text-emerald-200">
                This password is shown only once and is not stored in plaintext. Share it securely with{' '}
                <span className="font-mono font-semibold">{issuedCredentials.studentId}</span>. First-login password change is enforced.
              </p>
              <p className="mt-2 font-mono text-sm font-bold text-slate-900 dark:text-white">
                {issuedCredentials.temporaryPassword}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={copyPassword}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-900"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Credentials'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIssuedCredentials(null)}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:text-emerald-200"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <UserCheck className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-medium">No {statusFilter === 'all' ? '' : statusFilter} registration requests</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                    {r.student_id}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-base font-semibold">{r.full_name}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`text-xs font-medium capitalize ${
                      r.status === 'approved'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : r.status === 'rejected'
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {r.department?.name} · {r.course?.name} · Admission {r.admission_year}
                  {r.batch ? ` · ${r.batch.name}` : ''}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {r.personal_email} {r.phone ? ` · ${r.phone}` : ''}
                  {r.supporting_note ? ` · Note: "${r.supporting_note}"` : ''}
                </p>
                {r.rejection_reason && (
                  <p className="text-xs text-red-700 dark:text-red-400">
                    Rejection reason: {r.rejection_reason}
                  </p>
                )}
              </div>

              {r.status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={processingId === r.id}
                    onClick={() => handleApprove(r)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600"
                  >
                    {processingId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    <span>Approve &amp; Provision</span>
                  </button>
                  <button
                    type="button"
                    disabled={processingId === r.id}
                    onClick={() => handleReject(r)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
