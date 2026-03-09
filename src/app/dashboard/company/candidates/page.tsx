'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  Users,
  Building2,
  ChevronRight,
  Search,
  GitCompare,
  Sparkles,
} from 'lucide-react';
import { Spinner } from '@/components/ui';
import {
  TalentPoolManager,
  AIRankingPanel,
  CandidateComparisonTable,
} from '@/components/company/candidates';
import { BulkActionsToolbar } from '@/components/company/pipeline';
import type { CandidateForComparison } from '@/components/company/candidates';

interface CandidateRow extends CandidateForComparison {
  id: string;
  full_name?: string;
  primary_title?: string;
  email?: string;
  created_at?: string;
  location?: string;
  years_of_experience?: number;
  skills?: string[];
}

function CompanyCandidatesContent() {
  const searchParams = useSearchParams();
  const poolId = searchParams.get('pool') ?? undefined;
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; stage_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [jobFilterId, setJobFilterId] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [showRank, setShowRank] = useState(false);
  const [rankJobId, setRankJobId] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from('profile_roles')
      .select('company_id')
      .eq('id', session.user.id)
      .single();
    if (!profile?.company_id) {
      setCompanyId(null);
      setCandidates([]);
      setJobs([]);
      setLoading(false);
      return;
    }
    const { data: jobRows } = await supabase
      .from('jobs')
      .select('id, title')
      .eq('company_id', profile.company_id);
    const jobList = jobRows || [];
    const jobIds = jobList.map((j: { id: string }) => j.id);
    setJobs(jobList);

    if (poolId) {
      const { data: members } = await supabase
        .from('talent_pool_members')
        .select('candidate_id')
        .eq('pool_id', poolId);
      const poolCandidateIds = (members || []).map((m: { candidate_id: string }) => m.candidate_id);
      if (poolCandidateIds.length === 0) {
        setCandidates([]);
        setCompanyId(profile.company_id);
        setLoading(false);
        return;
      }
      const { data: candData } = await supabase
        .from('candidates')
        .select('id, full_name, primary_title, email, created_at, location, years_of_experience, skills')
        .in('id', poolCandidateIds)
        .order('created_at', { ascending: false });
      setCandidates(candData || []);
    } else {
      if (jobIds.length === 0) {
        setCandidates([]);
        setCompanyId(profile.company_id);
        setLoading(false);
        return;
      }
      const [appRes, matchRes] = await Promise.all([
        supabase.from('applications').select('candidate_id').in('job_id', jobIds),
        supabase.from('candidate_job_matches').select('candidate_id').in('job_id', jobIds),
      ]);
      const ids = new Set([
        ...(appRes.data || []).map((a: { candidate_id: string }) => a.candidate_id),
        ...(matchRes.data || []).map((m: { candidate_id: string }) => m.candidate_id),
      ]);
      if (ids.size === 0) {
        setCandidates([]);
        setCompanyId(profile.company_id);
        setLoading(false);
        return;
      }
      const { data: candData } = await supabase
        .from('candidates')
        .select('id, full_name, primary_title, email, created_at, location, years_of_experience, skills')
        .in('id', Array.from(ids))
        .order('created_at', { ascending: false });
      setCandidates(candData || []);
    }

    const stagesRes = await fetch('/api/company/pipeline/stages');
    if (stagesRes.ok) {
      const stagesData = await stagesRes.json();
      setStages(stagesData.stages || []);
    }
    setCompanyId(profile.company_id);
    setLoading(false);
  }, [supabase, poolId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = candidates.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.primary_title || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((c) => c.id)));
  };

  const selectedCandidatesForCompare: CandidateForComparison[] = filtered.filter((c) =>
    selectedIds.has(c.id)
  );

  const handleMoveToStage = async (stageId: string) => {
    const appRes = await fetch('/api/applications');
    const data = await appRes.json().catch(() => ({}));
    const applications = (data.applications || []) as { id: string; candidate_id: string; job_id: string }[];
    for (const candidateId of selectedIds) {
      const matching = applications.filter((a) => a.candidate_id === candidateId);
      const app = jobFilterId
        ? matching.find((a) => a.job_id === jobFilterId)
        : matching[0];
      if (app) {
        await fetch('/api/company/pipeline/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: app.id, to_stage_id: stageId }),
        });
      }
    }
    setSelectedIds(new Set());
    load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={28} />
      </div>
    );
  }
  if (!companyId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Building2 className="w-12 h-12 text-surface-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">No company linked</h2>
        <p className="text-surface-400">Contact your platform administrator.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <main className="flex-1 min-w-0 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">Candidates</h1>
            <p className="text-surface-500 dark:text-surface-400 text-sm mt-1">
              {poolId ? 'Talent pool' : 'Candidates who applied or were matched to your jobs.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
              />
              <input
                type="search"
                placeholder="Search by name, title, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm"
              />
            </div>
            <select
              value={jobFilterId ?? ''}
              onChange={(e) => setJobFilterId(e.target.value || undefined)}
              className="px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 text-sm"
            >
              <option value="">All jobs</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
            {selectedIds.size >= 2 && (
              <button
                type="button"
                onClick={() => setShowCompare(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 text-sm font-medium hover:bg-surface-50 dark:hover:bg-surface-700"
              >
                <GitCompare size={16} /> Compare ({selectedIds.size})
              </button>
            )}
            {selectedIds.size >= 1 && (
              <button
                type="button"
                onClick={() => { setRankJobId(jobFilterId || jobs[0]?.id); setShowRank(true); }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 text-sm font-medium hover:bg-surface-50 dark:hover:bg-surface-700"
              >
                <Sparkles size={16} /> AI Rank
              </button>
            )}
          </div>

          <BulkActionsToolbar
            selectedIds={Array.from(selectedIds)}
            onClearSelection={() => setSelectedIds(new Set())}
            onMoveToStage={handleMoveToStage}
            stageOptions={stages}
          />

          <div className="rounded-2xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-12 text-center text-surface-500">
                <Users className="w-12 h-12 mx-auto mb-3 text-surface-400" />
                <p>
                  {poolId ? 'No candidates in this pool.' : 'No candidates yet. Post jobs and get applications or matches.'}
                </p>
                {!poolId && (
                  <Link href="/dashboard/company/jobs" className="text-brand-500 hover:underline mt-2 inline-block">
                    Go to jobs →
                  </Link>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-surface-200 dark:divide-surface-600">
                <li className="flex items-center gap-3 px-4 py-2 bg-surface-100 dark:bg-surface-800/80 border-b border-surface-200 dark:border-surface-600">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={selectAll}
                    className="rounded border-surface-300 dark:border-surface-600"
                  />
                  <span className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">
                    Select all
                  </span>
                </li>
                {filtered.map((c) => (
                  <li key={c.id}>
                    <div className="flex items-center gap-3 px-4 py-4 hover:bg-surface-100 dark:hover:bg-surface-700/30">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-surface-300 dark:border-surface-600"
                      />
                      <Link
                        href={`/dashboard/company/candidates/${c.id}`}
                        className="flex-1 flex items-center justify-between min-w-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-500/25 flex items-center justify-center text-brand-700 dark:text-brand-300 font-semibold shrink-0">
                            {(c.full_name || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-surface-900 dark:text-surface-100 truncate">
                              {c.full_name}
                            </div>
                            <div className="text-xs text-surface-500 dark:text-surface-400 truncate">
                              {c.primary_title}
                              {c.email && ` · ${c.email}`}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={18} className="text-surface-400 shrink-0 ml-2" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>

        <aside className="w-full lg:w-72 shrink-0">
          <TalentPoolManager onSelectPool={() => {}} />
        </aside>
      </div>

      {showCompare && selectedCandidatesForCompare.length >= 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowCompare(false)} role="dialog" aria-modal="true">
          <div
            className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-4">
              Compare candidates
            </h2>
            <CandidateComparisonTable
              candidates={selectedCandidatesForCompare}
              jobId={jobFilterId}
            />
            <button
              type="button"
              onClick={() => setShowCompare(false)}
              className="mt-4 px-4 py-2 rounded-lg border border-surface-300 dark:border-surface-600 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showRank && rankJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowRank(false)} role="dialog" aria-modal="true">
          <div
            className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-4">
              AI candidate ranking
            </h2>
            <AIRankingPanel
              jobId={rankJobId}
              jobTitle={jobs.find((j) => j.id === rankJobId)?.title}
              candidateIds={Array.from(selectedIds)}
            />
            <button
              type="button"
              onClick={() => setShowRank(false)}
              className="mt-4 px-4 py-2 rounded-lg border border-surface-300 dark:border-surface-600 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompanyCandidatesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner size={28} /></div>}>
      <CompanyCandidatesContent />
    </Suspense>
  );
}
