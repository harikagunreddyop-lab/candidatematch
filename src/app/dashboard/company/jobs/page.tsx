'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, Plus, ChevronRight, Building2 } from 'lucide-react';
import { formatRelative, cn } from '@/utils/helpers';
import { Spinner } from '@/components/ui';

export default function CompanyJobsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data: profile } = await supabase.from('profile_roles').select('company_id').eq('id', session.user.id).single();
    if (!profile?.company_id) {
      setCompanyId(null);
      setJobs([]);
      setLoading(false);
      return;
    }
    setCompanyId(profile.company_id);
    const { data } = await supabase.from('jobs').select('*').eq('company_id', profile.company_id).order('created_at', { ascending: false });
    setJobs(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (!companyId) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <Building2 className="w-12 h-12 text-surface-500 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-white mb-2">No company linked</h2>
      <p className="text-surface-400">Contact your platform administrator to link your account to a company.</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Company Jobs</h1>
        <Link href="/dashboard/company/jobs/new" className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold">
          <Plus size={18} /> Post job
        </Link>
      </div>

      <div className="rounded-2xl border border-surface-700 bg-surface-800/50 overflow-hidden">
        {jobs.length === 0 ? (
          <div className="p-12 text-center text-surface-500">
            <Briefcase className="w-12 h-12 mx-auto mb-3 text-surface-600" />
            <p>No jobs yet.</p>
            <Link href="/dashboard/company/jobs/new" className="text-violet-400 hover:underline mt-2 inline-block">Post your first job →</Link>
          </div>
        ) : (
          <ul className="divide-y divide-surface-700/50">
            {jobs.map((j: any) => (
              <Link key={j.id} href={`/dashboard/company/jobs/${j.id}`} className="block px-6 py-4 hover:bg-surface-700/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">{j.title}</div>
                    <div className="text-xs text-surface-500">{j.company} · {j.applications_count ?? 0} applicants · {formatRelative(j.scraped_at || j.created_at)}</div>
                  </div>
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', j.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-600 text-surface-400')}>
                    {j.is_active ? 'Live' : 'Closed'}
                  </span>
                  <ChevronRight size={18} className="text-surface-500" />
                </div>
              </Link>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
