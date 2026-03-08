'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { Plus, ChevronRight, Building2 } from 'lucide-react';
import { formatRelative, cn } from '@/utils/helpers';
import { PageLoaderSkeleton, EmptyJobsState, ErrorState } from '@/components/ui';

export default function CompanyJobsPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      <div className="rounded-2xl border border-surface-300/60 bg-surface-100/90 overflow-hidden card-hover-policy">
        {jobs.length === 0 ? (
          <EmptyJobsState postJobHref="/dashboard/company/jobs/new" />
        ) : (
          <ul className="divide-y divide-surface-300/50" role="list">
            {jobs.map((j: any) => (
              <li key={j.id}>
                <Link
                  href={`/dashboard/company/jobs/${j.id}`}
                  className="block px-6 py-4 hover:bg-surface-200/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
                >
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
