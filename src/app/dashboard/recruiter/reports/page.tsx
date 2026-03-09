'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient, subscribeWithLog } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import {
  BarChart3, Target, Star, AlertCircle,
  ArrowRight, TrendingUp,
} from 'lucide-react';
import { cn } from '@/utils/helpers';

const SCORE_STRONG = 82;

function SectionCard({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-xl bg-brand-500/10 dark:bg-brand-500/20 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display">{title}</h2>
          {subtitle && <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function RecruiterReportsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [_profile, setProfile] = useState<any>(null);
  const [noCompany, setNoCompany] = useState(false);
  const [pipeline, setPipeline] = useState<Record<string, number>>({});
  const [bestFitCandidates, setBestFitCandidates] = useState<any[]>([]);
  const [rolesNeedingAttention, setRolesNeedingAttention] = useState<any[]>([]);
  const [topMatches, setTopMatches] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalCandidates: 0, totalMatches: 0, avgScore: 0, strongMatchCount: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const userId = session.user.id;

    const { data: profileRow } = await supabase.from('profiles').select('name').eq('id', userId).single();
    setProfile(profileRow);

    const { data: roleCtx } = await supabase
      .from('profile_roles')
      .select('company_id')
      .eq('id', userId)
      .single();
    const companyId = roleCtx?.company_id;

    if (!companyId) {
      setNoCompany(true);
      setPipeline({});
      setBestFitCandidates([]);
      setRolesNeedingAttention([]);
      setTopMatches([]);
      setStats({ totalCandidates: 0, totalMatches: 0, avgScore: 0, strongMatchCount: 0 });
      setLoading(false);
      return;
    }
    setNoCompany(false);

    const { data: companyJobs } = await supabase
      .from('jobs')
      .select('id, title, company')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const jobIds = (companyJobs || []).map((j: any) => j.id);
    if (jobIds.length === 0) {
      setPipeline({});
      setBestFitCandidates([]);
      setRolesNeedingAttention([]);
      setTopMatches([]);
      setStats({ totalCandidates: 0, totalMatches: 0, avgScore: 0, strongMatchCount: 0 });
      setLoading(false);
      return;
    }

    const [matchesRes, appsRes, jobsRes] = await Promise.all([
      supabase.from('candidate_job_matches')
        .select('id, candidate_id, job_id, fit_score, ats_score, matched_at, job:jobs(id, title, company), candidate:candidates(full_name, primary_title)', { count: 'exact' })
        .in('job_id', jobIds)
        .order('fit_score', { ascending: false })
        .limit(2000),
      supabase.from('applications').select('status, candidate_id').in('job_id', jobIds),
      Promise.resolve({ data: companyJobs || [] } as any),
    ]);

    const allMatches = matchesRes.data || [];
    const matchCount = matchesRes.count ?? allMatches.length;
    const allApps = appsRes.data || [];
    const allJobs = jobsRes.data || [];

    const candidateIdSet = new Set<string>([
      ...allMatches.map((m: any) => m.candidate_id).filter(Boolean),
      ...allApps.map((a: any) => a.candidate_id).filter(Boolean),
    ]);
    const candidateIds = Array.from(candidateIdSet);

    const { data: candsData } = candidateIds.length > 0
      ? await supabase.from('candidates').select('id, full_name, primary_title').in('id', candidateIds)
      : ({ data: [] } as any);
    const cands = candsData || [];

    const pipelineCount: Record<string, number> = {
      applied: 0,
      screening: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
      withdrawn: 0,
    };
    for (const a of allApps) {
      pipelineCount[a.status] = (pipelineCount[a.status] || 0) + 1;
    }
    setPipeline(pipelineCount);

    const strongMatches = allMatches.filter((m: any) => m.fit_score >= SCORE_STRONG);
    const candidateTopScore: Record<string, number> = {};
    for (const m of allMatches) {
      const cid = m.candidate_id;
      if (candidateTopScore[cid] == null || m.fit_score > candidateTopScore[cid]) {
        candidateTopScore[cid] = m.fit_score;
      }
    }
    const bestFit = cands
      .map((c: any) => ({ ...c, topScore: candidateTopScore[c.id] ?? 0, strongCount: allMatches.filter((m: any) => m.candidate_id === c.id && m.fit_score >= SCORE_STRONG).length }))
      .filter((c: any) => c.topScore >= 75)
      .sort((a: any, b: any) => (b.topScore || 0) - (a.topScore || 0))
      .slice(0, 10);
    setBestFitCandidates(bestFit);

    const jobMatchCount: Record<string, { count: number; strong: number; topScore: number }> = {};
    for (const j of allJobs) {
      jobMatchCount[j.id] = { count: 0, strong: 0, topScore: 0 };
    }
    for (const m of allMatches) {
      const jid = m.job_id;
      if (jobMatchCount[jid]) {
        jobMatchCount[jid].count++;
        if (m.fit_score >= SCORE_STRONG) jobMatchCount[jid].strong++;
        if (m.fit_score > (jobMatchCount[jid].topScore || 0)) jobMatchCount[jid].topScore = m.fit_score;
      }
    }
    const rolesAttention = allJobs
      .map((j: any) => ({
        ...j,
        ...jobMatchCount[j.id],
        hasStrong: (jobMatchCount[j.id]?.strong ?? 0) > 0,
      }))
      .filter((j: any) => j.count === 0 || !j.hasStrong)
      .sort((a: any, b: any) => a.count - b.count)
      .slice(0, 10);
    setRolesNeedingAttention(rolesAttention);

    setTopMatches(allMatches.slice(0, 15));

    const totalMatches = typeof matchCount === 'number' ? matchCount : allMatches.length;
    const scoresForAvg = allMatches.map((m: { ats_score?: number | null; fit_score?: number }) => {
      const v = typeof m.ats_score === 'number' ? m.ats_score : m.fit_score;
      return typeof v === 'number' ? v : null;
    }).filter((v): v is number => v !== null);
    const avgScore = scoresForAvg.length > 0 ? Math.round(scoresForAvg.reduce((s, v) => s + v, 0) / scoresForAvg.length) : 0;
    setStats({
      totalCandidates: candidateIds.length,
      totalMatches,
      avgScore,
      strongMatchCount: strongMatches.length,
    });
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('recruiter-talent-report')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidate_job_matches' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => load());
    subscribeWithLog(channel, 'recruiter-talent-report');
    return () => { supabase.removeChannel(channel); };
  }, [load, supabase]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Spinner size={32} className="text-brand-500" />
        <p className="text-sm text-surface-500 dark:text-surface-300 font-medium">Loading talent report…</p>
      </div>
    );
  }

  if (noCompany) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
        <h2 className="text-xl font-semibold text-surface-900 dark:text-surface-100">No company linked</h2>
        <p className="text-surface-500 dark:text-surface-400 mt-2 text-sm">Your account is not linked to a company. Ask your company admin to add you to the team.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
        <h1 className="text-lg font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2 mb-1">
          <BarChart3 size={20} className="text-brand-600 dark:text-brand-400" />
          Talent & fit report
        </h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">
          Pipeline summary, best-fit candidates, and roles that need attention across your company&apos;s active jobs.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl bg-surface-100 dark:bg-surface-700/50 p-4 border border-surface-100 dark:border-surface-600">
            <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums">{stats.totalCandidates}</p>
            <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Candidates</p>
          </div>
          <div className="rounded-xl bg-surface-100 dark:bg-surface-700/50 p-4 border border-surface-100 dark:border-surface-600">
            <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums">{stats.totalMatches}</p>
            <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Total matches</p>
          </div>
          <div className="rounded-xl bg-surface-100 dark:bg-surface-700/50 p-4 border border-surface-100 dark:border-surface-600">
            <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums">{stats.avgScore}</p>
            <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Avg ATS score</p>
          </div>
          <div className="rounded-xl bg-surface-100 dark:bg-surface-700/50 p-4 border border-surface-100 dark:border-surface-600">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.strongMatchCount}</p>
            <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Strong (82+)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Pipeline summary" subtitle="Your candidates' applications by stage" icon={<TrendingUp size={18} className="text-brand-600 dark:text-brand-400" />}>
            <div className="space-y-2">
              {['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'].map(stage => (
                <div key={stage} className="flex items-center justify-between py-1.5 border-b border-surface-100 dark:border-surface-700 last:border-0">
                  <span className="text-sm font-medium text-surface-700 dark:text-surface-200 capitalize">{stage}</span>
                  <span className="text-sm font-bold text-surface-900 dark:text-surface-100 tabular-nums">{pipeline[stage] ?? 0}</span>
                </div>
              ))}
            </div>
            <Link href="/dashboard/recruiter/applications" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
              View applications <ArrowRight size={12} />
            </Link>
          </SectionCard>

          <SectionCard title="Best fit candidates" subtitle="Candidates with strongest match scores for your company jobs" icon={<Star size={18} className="text-emerald-600 dark:text-emerald-400" />}>
            {bestFitCandidates.length === 0 ? (
              <p className="text-sm text-surface-500 dark:text-surface-400">No candidates with 75+ matches yet. Run matching to populate.</p>
            ) : (
              <ul className="space-y-2">
                {bestFitCandidates.map((c: any) => (
                  <li key={c.id}>
                    <Link href={`/dashboard/recruiter/candidates/${c.id}`} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700/50 transition-colors group">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">{c.full_name}</p>
                        <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{c.primary_title}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          'text-xs font-bold px-2 py-0.5 rounded-lg',
                          (c.topScore || 0) >= SCORE_STRONG ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        )}>
                          {c.topScore || '—'}
                        </span>
                        <span className="text-[10px] text-surface-400">{c.strongCount} strong</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/dashboard/recruiter/candidates" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
              View all candidates <ArrowRight size={12} />
            </Link>
          </SectionCard>
        </div>

        <div className="mt-6">
          <SectionCard title="Roles needing attention" subtitle="Jobs with no or few strong matches from your pool" icon={<AlertCircle size={18} className="text-amber-600 dark:text-amber-400" />}>
            {rolesNeedingAttention.length === 0 ? (
              <p className="text-sm text-surface-500 dark:text-surface-400">All active jobs have at least one strong match from your candidates.</p>
            ) : (
              <ul className="space-y-2">
                {rolesNeedingAttention.map((j: any) => (
                  <li key={j.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg border border-surface-100 dark:border-surface-700">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">{j.title}</p>
                      <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{j.company}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-surface-600 dark:text-surface-300">{j.count ?? 0} match{(j.count ?? 0) !== 1 ? 'es' : ''}</p>
                      <p className="text-[10px] text-surface-400">{j.hasStrong ? 'Has strong' : 'No 82+ yet'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/dashboard/recruiter/pipeline" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
              Pipeline board <ArrowRight size={12} />
            </Link>
          </SectionCard>
        </div>

        <div className="mt-6">
          <SectionCard title="Recent top matches" subtitle="Highest-scoring candidate–job pairs" icon={<Target size={18} className="text-brand-400 dark:text-brand-400" />}>
            {topMatches.length === 0 ? (
              <p className="text-sm text-surface-500 dark:text-surface-400">No matches yet.</p>
            ) : (
              <ul className="space-y-2">
                {topMatches.slice(0, 10).map((m: any) => (
                  <li key={m.id}>
                    <Link href={`/dashboard/recruiter/candidates/${m.candidate_id}`} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700/50 transition-colors">
                      <div className="min-w-0 truncate">
                        <span className="text-sm font-medium text-surface-900 dark:text-surface-100">{m.candidate?.full_name}</span>
                        <span className="text-surface-400 dark:text-surface-500 mx-1">→</span>
                        <span className="text-sm text-surface-700 dark:text-surface-200 truncate">{m.job?.title} at {m.job?.company}</span>
                      </div>
                      <span className={cn(
                        'shrink-0 text-xs font-bold px-2 py-0.5 rounded-lg',
                        (m.fit_score || 0) >= SCORE_STRONG ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                      )}>
                        {m.fit_score}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
