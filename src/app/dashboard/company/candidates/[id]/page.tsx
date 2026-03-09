'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { CollaborativeNotes } from '@/components/company/team';

export default function CompanyCandidateDetailPage() {
  const params = useParams();
  const candidateId = params?.id as string;
  const supabase = createClient();
  const [candidate, setCandidate] = useState<any>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [hasSuccessFeeAgreement, setHasSuccessFeeAgreement] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [signingAgreement, setSigningAgreement] = useState(false);

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

      const [candRes, appRes, agreementRes] = await Promise.all([
        supabase.from('candidates').select('*').eq('id', candidateId).single(),
        supabase.from('applications').select('*, job:jobs(id, title)').eq('candidate_id', candidateId).in('job_id', jobIds),
        supabase
          .from('success_fee_agreements')
          .select('id')
          .eq('company_id', profile.company_id)
          .eq('candidate_id', candidateId)
          .maybeSingle(),
      ]);
      if (!candRes.data) { setLoading(false); return; }
      const hasAccess = (appRes.data || []).length > 0 || (await supabase.from('candidate_job_matches').select('id').eq('candidate_id', candidateId).in('job_id', jobIds).limit(1)).data?.length;
      if (!hasAccess) { setAccessDenied(true); setCandidate(candRes.data); setLoading(false); return; }

      setCandidate(candRes.data);
      setCompanyId(profile.company_id);
      setApplications(appRes.data || []);
      setHasSuccessFeeAgreement(!!agreementRes.data);
      setLoading(false);
    })();
  }, [candidateId, supabase]);

  async function signAgreement() {
    if (!companyId || !candidateId) return;
    setSigningAgreement(true);
    const { error } = await supabase.from('success_fee_agreements').insert({
      company_id: companyId,
      candidate_id: candidateId,
    });
    if (error) {
      setSigningAgreement(false);
      return;
    }
    setHasSuccessFeeAgreement(true);
    setSigningAgreement(false);
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (accessDenied) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-surface-400">This candidate is not applied or matched to any of your company’s jobs.</p>
      <Link href="/dashboard/company/candidates" className="text-brand-400 hover:underline mt-2 inline-block">Back to candidates</Link>
    </div>
  );
  if (!candidate) return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-surface-500">Candidate not found.</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link href="/dashboard/company/candidates" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
        <ChevronLeft size={18} /> Candidates
      </Link>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-brand-400/20 text-brand-400 font-bold text-lg">{(candidate.full_name || '?')[0].toUpperCase()}</div>
        <div>
          <h1 className="text-2xl font-bold text-white">{candidate.full_name}</h1>
          <p className="text-surface-500">
            {candidate.primary_title}
            {hasSuccessFeeAgreement && candidate.email && ` · ${candidate.email}`}
            {!hasSuccessFeeAgreement && ' · Sign agreement to view contact'}
          </p>
        </div>
      </div>

      {/* Contact info gated by success fee agreement */}
      <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-6">
        <h2 className="font-semibold text-white mb-4">Contact information</h2>
        {hasSuccessFeeAgreement ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm text-surface-400">Email</div>
              <div className="text-white">{candidate.email || 'Not provided'}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-surface-400">Phone</div>
              <div className="text-white">{candidate.phone || 'Not provided'}</div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="font-semibold text-white">Success Fee Agreement Required</div>
            </div>
            <p className="text-sm text-surface-400 mb-4">
              Sign a success fee agreement to view candidate contact information and communicate directly.
            </p>
            <button
              type="button"
              onClick={signAgreement}
              disabled={signingAgreement}
              className="px-4 py-2 bg-brand-400 hover:bg-brand-300 disabled:opacity-60 text-white rounded-lg font-semibold transition-colors"
            >
              {signingAgreement ? 'Signing…' : 'Sign Agreement'}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-6">
        <h2 className="font-semibold text-white mb-3">Applications to your jobs</h2>
        {applications.length === 0 ? (
          <p className="text-surface-500 text-sm">No applications to your company’s jobs.</p>
        ) : (
          <ul className="space-y-2">
            {(applications as any[]).map((a: any) => (
              <li key={a.id} className="flex items-center justify-between py-2 border-b border-surface-700/50 last:border-0">
                <span className="text-white">{(a.job as any)?.title}</span>
                <span className="text-surface-500 text-sm capitalize">{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CollaborativeNotes
        candidateId={candidateId}
        candidateName={candidate.full_name}
      />
    </div>
  );
}
