'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Spinner } from '@/components/ui';

export default function RecruiterJobCandidatesPage() {
  const params = useParams();
  const jobId = params?.id as string;
  const [matches, setMatches] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!jobId) return;
    loadMatches();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMatches keyed by jobId only
  }, [jobId]);

  async function loadMatches() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const { data: jobData } = await supabase
      .from('jobs')
      .select('id, title, company, company_id, applications_count')
      .eq('id', jobId)
      .eq('posted_by', session.user.id)
      .single();

    if (!jobData) {
      setLoading(false);
      return;
    }

    setJob(jobData);

    const [matchRes, appRes] = await Promise.all([
      supabase
        .from('candidate_job_matches')
        .select(`
          id, fit_score, candidate_id, matched_at,
          candidate:candidates(id, full_name, primary_title, email)
        `)
        .eq('job_id', jobId)
        .gte('fit_score', 50)
        .order('fit_score', { ascending: false }),
      supabase
        .from('applications')
        .select(`
          id, candidate_id, status, created_at,
          candidate:candidates(id, full_name, primary_title, email)
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }),
    ]);

    setMatches(matchRes.data || []);
    setApplications(appRes.data || []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={28} />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-surface-400">Job not found or access denied. You can only view candidates for jobs you posted.</p>
        <Link href="/dashboard/recruiter/jobs" className="text-brand-400 hover:underline mt-2 inline-block">Back to my jobs</Link>
      </div>
    );
  }

  const appliedIds = new Set((applications as any[]).map((a: any) => a.candidate_id));
  const matchOnly = (matches as any[]).filter((m: any) => !appliedIds.has(m.candidate_id));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Link
        href={`/dashboard/recruiter/jobs/${jobId}`}
        className="text-surface-400 hover:text-white flex items-center gap-1 text-sm"
      >
        <ChevronLeft size={18} /> Back to job
      </Link>
      <h1 className="text-3xl font-bold text-white">{job.title}</h1>
      <p className="text-surface-400">
        {matches.length} matched · {applications.length} applications
      </p>

      <div className="rounded-2xl border border-surface-700 bg-surface-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-700 font-semibold text-white">
          Applications ({applications.length})
        </div>
        {applications.length === 0 ? (
          <div className="p-6 text-surface-500 text-sm">No applications yet.</div>
        ) : (
          <ul className="divide-y divide-surface-700/50">
            {(applications as any[]).map((a: any) => {
              const c = Array.isArray(a.candidate) ? a.candidate[0] : a.candidate;
              return (
                <li key={a.id}>
                  <Link
                    href={`/dashboard/recruiter/candidates/${a.candidate_id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-surface-700/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-400/20 flex items-center justify-center text-brand-400 font-semibold text-sm">
                        {c?.full_name?.[0] || '?'}
                      </div>
                      <div>
                        <div className="font-medium text-white">{c?.full_name}</div>
                        <div className="text-xs text-surface-500">{c?.primary_title} · {a.status}</div>
                      </div>
                    </div>
                    <span className="text-surface-500 text-sm">Applied</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-surface-700 bg-surface-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-700 font-semibold text-white">
          Top matches (not yet applied) ({matchOnly.length})
        </div>
        {matchOnly.length === 0 ? (
          <div className="p-6 text-surface-500 text-sm">No other matches to show.</div>
        ) : (
          <ul className="divide-y divide-surface-700/50">
            {(matchOnly as any[]).slice(0, 50).map((m: any) => {
              const c = Array.isArray(m.candidate) ? m.candidate[0] : m.candidate;
              return (
                <li key={m.id}>
                  <Link
                    href={`/dashboard/recruiter/candidates/${m.candidate_id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-surface-700/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-400/20 flex items-center justify-center text-brand-400 font-semibold text-sm">
                        {c?.full_name?.[0] || '?'}
                      </div>
                      <div>
                        <div className="font-medium text-white">{c?.full_name}</div>
                        <div className="text-xs text-surface-500">{c?.primary_title}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-emerald-400">{m.fit_score}%</div>
                      <div className="text-xs text-surface-500">Fit Score</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
