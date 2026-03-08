'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { Users, Building2, ChevronRight } from 'lucide-react';
import { Spinner } from '@/components/ui';

export default function CompanyCandidatesPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data: profile } = await supabase.from('profile_roles').select('company_id').eq('id', session.user.id).single();
    if (!profile?.company_id) {
      setCompanyId(null);
      setCandidates([]);
      setLoading(false);
      return;
    }
    const { data: jobRows } = await supabase.from('jobs').select('id').eq('company_id', profile.company_id);
    const jobIds = (jobRows || []).map((j: any) => j.id);
    if (jobIds.length === 0) {
      setCompanyId(profile.company_id);
      setCandidates([]);
      setLoading(false);
      return;
    }
    const [appRes, matchRes] = await Promise.all([
      supabase.from('applications').select('candidate_id').in('job_id', jobIds),
      supabase.from('candidate_job_matches').select('candidate_id').in('job_id', jobIds),
    ]);
    const ids = new Set([
      ...(appRes.data || []).map((a: any) => a.candidate_id),
      ...(matchRes.data || []).map((m: any) => m.candidate_id),
    ]);
    if (ids.size === 0) {
      setCompanyId(profile.company_id);
      setCandidates([]);
      setLoading(false);
      return;
    }
    const { data: candData } = await supabase.from('candidates').select('id, full_name, primary_title, email, created_at').in('id', Array.from(ids)).order('created_at', { ascending: false });
    setCompanyId(profile.company_id);
    setCandidates(candData || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (!companyId) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <Building2 className="w-12 h-12 text-surface-500 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-white mb-2">No company linked</h2>
      <p className="text-surface-400">Contact your platform administrator.</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">Candidates</h1>
      <p className="text-surface-400 text-sm">Candidates who applied to or were matched to your company’s jobs.</p>

      <div className="rounded-2xl border border-surface-700 bg-surface-800/50 overflow-hidden">
        {candidates.length === 0 ? (
          <div className="p-12 text-center text-surface-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-surface-600" />
            <p>No candidates yet. Post jobs and get applications or matches.</p>
            <Link href="/dashboard/company/jobs" className="text-brand-400 hover:underline mt-2 inline-block">Go to jobs →</Link>
          </div>
        ) : (
          <ul className="divide-y divide-surface-700/50">
            {candidates.map((c: any) => (
              <li key={c.id}>
                <Link href={`/dashboard/company/candidates/${c.id}`} className="flex items-center justify-between px-6 py-4 hover:bg-surface-700/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-400/20 flex items-center justify-center text-brand-400 font-semibold">
                      {(c.full_name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-white">{c.full_name}</div>
                      <div className="text-xs text-surface-500">{c.primary_title} {c.email && `· ${c.email}`}</div>
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
