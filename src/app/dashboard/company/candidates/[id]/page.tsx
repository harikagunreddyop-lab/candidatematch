'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Building2, ChevronLeft } from 'lucide-react';
import { Spinner } from '@/components/ui';

export default function CompanyCandidateDetailPage() {
  const params = useParams();
  const candidateId = params?.id as string;
  const supabase = createClient();
  const [candidate, setCandidate] = useState<any>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!candidateId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: profile } = await supabase.from('profile_roles').select('company_id').eq('id', session.user.id).single();
      if (!profile?.company_id) { setAccessDenied(true); setLoading(false); return; }

      const { data: jobRows } = await supabase.from('jobs').select('id').eq('company_id', profile.company_id);
      const jobIds = (jobRows || []).map((j: any) => j.id);
      if (jobIds.length === 0) { setAccessDenied(true); setLoading(false); return; }

      const [candRes, appRes] = await Promise.all([
        supabase.from('candidates').select('*').eq('id', candidateId).single(),
        supabase.from('applications').select('*, job:jobs(id, title)').eq('candidate_id', candidateId).in('job_id', jobIds),
      ]);
      if (!candRes.data) { setLoading(false); return; }
      const hasAccess = (appRes.data || []).length > 0 || (await supabase.from('candidate_job_matches').select('id').eq('candidate_id', candidateId).in('job_id', jobIds).limit(1)).data?.length;
      if (!hasAccess) { setAccessDenied(true); setCandidate(candRes.data); setLoading(false); return; }

      setCandidate(candRes.data);
      setCompanyId(profile.company_id);
      setApplications(appRes.data || []);
      setLoading(false);
    })();
  }, [candidateId, supabase]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (accessDenied) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-surface-400">This candidate is not applied or matched to any of your company’s jobs.</p>
      <Link href="/dashboard/company/candidates" className="text-violet-400 hover:underline mt-2 inline-block">Back to candidates</Link>
    </div>
  );
  if (!candidate) return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-surface-500">Candidate not found.</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link href="/dashboard/company/candidates" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
        <ChevronLeft size={18} /> Candidates
      </Link>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-lg">{(candidate.full_name || '?')[0].toUpperCase()}</div>
        <div>
          <h1 className="text-2xl font-bold text-white">{candidate.full_name}</h1>
          <p className="text-surface-500">{candidate.primary_title} {candidate.email && `· ${candidate.email}`}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-6">
        <h2 className="font-semibold text-white mb-3">Applications to your jobs</h2>
        {applications.length === 0 ? <p className="text-surface-500 text-sm">No applications to your company’s jobs.</p> : (
          <ul className="space-y-2">
            {(applications as any[]).map((a: any) => (
              <li key={a.id} className="flex items-center justify-between py-2 border-b border-surface-700/50 last:border-0">
                <span className="text-white">{(a.job as any)?.title}</span>
                <span className="text-surface-500 text-sm">{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
