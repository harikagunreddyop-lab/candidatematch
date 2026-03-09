'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { Plus, ChevronRight, Building2, Pause, Archive, Trash2 } from 'lucide-react';
import { formatRelative, cn } from '@/utils/helpers';
import { PageLoaderSkeleton, EmptyJobsState, ErrorState } from '@/components/ui';

export default function CompanyJobsPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    try {
      const { data: profile, error: profileErr } = await supabase.from('profile_roles').select('company_id').eq('id', session.user.id).single();
      if (profileErr || !profile?.company_id) {
        setCompanyId(null);
        setJobs([]);
        setLoading(false);
        return;
      }
      setCompanyId(profile.company_id);
      const { data, error: jobsErr } = await supabase.from('jobs').select('*').eq('company_id', profile.company_id).order('created_at', { ascending: false });
      if (jobsErr) throw jobsErr;
      setJobs(data || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === jobs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(jobs.map((j: { id: string }) => j.id)));
  };
  const runBulk = async (action: 'pause' | 'archive' | 'delete') => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/company/jobs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, job_ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedIds(new Set());
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Bulk action failed');
    } finally {
      setBulkLoading(false);
    }
  };

  if (loading) return <PageLoaderSkeleton type="list" />;
  if (error) return <ErrorState error={error} retry={load} />;
  if (!companyId) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <Building2 className="w-12 h-12 text-surface-500 mx-auto mb-4" aria-hidden />
      <h2 className="text-xl font-semibold text-white mb-2">No company linked</h2>
      <p className="text-surface-400">Contact your platform administrator to link your account to a company.</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white font-display">Company Jobs</h1>
        <Link
          href="/dashboard/company/jobs/new"
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={18} aria-hidden /> Post job
        </Link>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-700 bg-surface-800/50 p-3">
          <span className="text-surface-400 text-sm">{selectedIds.size} selected</span>
          <button type="button" onClick={() => runBulk('pause')} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
            <Pause size={14} /> Pause
          </button>
          <button type="button" onClick={() => runBulk('archive')} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-600 hover:bg-surface-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
            <Archive size={14} /> Archive
          </button>
          <button type="button" onClick={() => runBulk('delete')} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
            <Trash2 size={14} /> Delete
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="text-surface-400 hover:text-white text-sm">Clear</button>
        </div>
      )}

      <div className="rounded-2xl border border-surface-300/60 bg-surface-100/90 overflow-hidden card-hover-policy">
        {jobs.length === 0 ? (
          <EmptyJobsState postJobHref="/dashboard/company/jobs/new" />
        ) : (
          <>
            {jobs.length > 0 && (
              <div className="px-4 py-2 border-b border-surface-300/50 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.size === jobs.length}
                  onChange={toggleSelectAll}
                  className="rounded border-surface-500"
                />
                <span className="text-xs text-surface-500">Select all</span>
              </div>
            )}
          <ul className="divide-y divide-surface-300/50" role="list">
            {jobs.map((j: any) => (
              <li key={j.id}>
                <div className="flex items-center gap-3 px-6 py-4 hover:bg-surface-200/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(j.id)}
                    onChange={() => toggleSelect(j.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-surface-500 shrink-0"
                  />
                <Link href={`/dashboard/company/jobs/${j.id}`} className="flex-1 min-w-0 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset rounded">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">{j.title}</div>
                      <div className="text-xs text-surface-500">{j.company} · {j.applications_count ?? 0} applicants · {formatRelative(j.scraped_at || j.created_at)}</div>
                    </div>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', j.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-600 text-surface-400')}>
                      {j.is_active ? 'Live' : 'Closed'}
                    </span>
                    <ChevronRight size={18} className="text-surface-500" aria-hidden />
                  </div>
                </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
        )}
      </div>
    </div>
  );
}
