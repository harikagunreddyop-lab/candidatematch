'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Users, ChevronRight, Building2 } from 'lucide-react';
import { Spinner } from '@/components/ui';

export default function CompanyJobCandidatesPage() {
  const params = useParams();
  const jobId = params?.id as string;
  const supabase = createClient();
  const [job, setJob] = useState<any>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: profile } = await supabase.from('profile_roles').select('company_id').eq('id', session.user.id).single();
      if (!profile?.company_id) { setLoading(false); return; }

      const { data: jobData } = await supabase.from('jobs').select('*').eq('id', jobId).eq('company_id', profile.company_id).single();
      if (!jobData) { setLoading(false); return; }

      setJob(jobData);
      setCompanyId(profile.company_id);

      const [appRes, matchRes] = await Promise.all([
        supabase.from('applications').select('*, candidate:candidates(id, full_name, primary_title, email)').eq('job_id', jobId).order('created_at', { ascending: false }),
        supabase.from('candidate_job_matches').select('*, candidate:candidates(id, full_name, primary_title)').eq('job_id', jobId).gte('fit_score', 50).order('fit_score', { ascending: false }),
      ]);
      setApplications(appRes.data || []);
      setMatches(matchRes.data || []);
      setLoading(false);
    })();
  }, [jobId, supabase]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (!job) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center text-surface-500">
      Job not found. <Link href="/dashboard/company/jobs" className="text-brand-400 hover:underline">Back to jobs</Link>
    </div>
  );

  const appliedIds = new Set((applications as any[]).map((a: any) => a.candidate_id));
  const matchOnly = (matches as any[]).filter((m: any) => !appliedIds.has(m.candidate_id));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link href={`/dashboard/company/jobs/${jobId}`} className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
        ← Back to job
      </Link>
      <h1 className="text-2xl font-bold text-white">Candidates for {job.title}</h1>

      <div className="rounded-2xl border border-surface-700 bg-surface-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-700 font-semibold text-white">Applications ({applications.length})</div>
        {applications.length === 0 ? <div className="p-6 text-surface-500 text-sm">No applications yet.</div> : (
          <ul className="divide-y divide-surface-700/50">
            {(applications as any[]).map((a: any) => (
              <li key={a.id}>
                <Link href={`/dashboard/company/candidates/${a.candidate_id}`} className="flex items-center justify-between px-6 py-4 hover:bg-surface-700/30">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-brand-400/20 flex items-center justify-center text-brand-400 font-semibold text-sm">
                      {(a.candidate as any)?.full_name?.[0] || '?'}
                    </div>
                    <div>
                      <div className="font-medium text-white">{(a.candidate as any)?.full_name}</div>
                      <div className="text-xs text-surface-500">{(a.candidate as any)?.primary_title} · {a.status}</div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-surface-500" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-surface-700 bg-surface-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-700 font-semibold text-white">Top matches (not yet applied) ({matchOnly.length})</div>
        {matchOnly.length === 0 ? <div className="p-6 text-surface-500 text-sm">No other matches to show.</div> : (
          <ul className="divide-y divide-surface-700/50">
            {matchOnly.slice(0, 20).map((m: any) => (
              <li key={m.id}>
                <Link href={`/dashboard/company/candidates/${m.candidate_id}`} className="flex items-center justify-between px-6 py-4 hover:bg-surface-700/30">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-brand-400/20 flex items-center justify-center text-brand-400 font-semibold text-sm">
                      {(m.candidate as any)?.full_name?.[0] || '?'}
                    </div>
                    <div>
                      <div className="font-medium text-white">{(m.candidate as any)?.full_name}</div>
                      <div className="text-xs text-surface-500">{(m.candidate as any)?.primary_title} · {m.fit_score}% fit</div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-surface-500" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
