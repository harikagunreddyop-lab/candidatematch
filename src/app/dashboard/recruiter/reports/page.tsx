'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import {
  BarChart3, Users, Briefcase, Target, Star, AlertCircle,
  ArrowRight, TrendingUp, UserCheck, FileText,
} from 'lucide-react';
import { cn } from '@/utils/helpers';

const SCORE_STRONG = 82;

function SectionCard({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
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
  const [profile, setProfile] = useState<any>(null);
  const [pipeline, setPipeline] = useState<Record<string, number>>({});
  const [bestFitCandidates, setBestFitCandidates] = useState<any[]>([]);
  const [rolesNeedingAttention, setRolesNeedingAttention] = useState<any[]>([]);
  const [topMatches, setTopMatches] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalCandidates: 0, totalMatches: 0, avgScore: 0, strongMatchCount: 0 });

  const load = useCallback(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const rid = session.user.id;

      const { data: profileRow } = await supabase.from('profiles').select('name').eq('id', rid).single();
      setProfile(profileRow);

      const { data: assignments } = await supabase
        .from('recruiter_candidate_assignments')
        .select('candidate_id')
        .eq('recruiter_id', rid);
      const candidateIds = (assignments || []).map((a: any) => a.candidate_id);
      if (candidateIds.length === 0) {
        setPipeline({});
        setBestFitCandidates([]);
        setRolesNeedingAttention([]);
        setTopMatches([]);
        setStats({ totalCandidates: 0, totalMatches: 0, avgScore: 0, strongMatchCount: 0 });
        setLoading(false);
        return;
      }

      const [candsRes, matchesRes, appsRes, jobsRes] = await Promise.all([
        supabase.from('candidates').select('id, full_name, primary_title').in('id', candidateIds),
        supabase.from('candidate_job_matches')
          .select('id, candidate_id, job_id, fit_score, matched_at, job:jobs(id, title, company), candidate:candidates(full_name, primary_title)')
          .in('candidate_id', candidateIds)
          .order('fit_score', { ascending: false }),
        supabase.from('applications').select('status').in('candidate_id', candidateIds),
        supabase.from('jobs').select('id, title, company').eq('is_active', true),
      ]);

      const cands = candsRes.data || [];

      const allMatches = matchesRes.data || [];
      const allApps = appsRes.data || [];
      const allJobs = jobsRes.data || [];

      const pipelineCount: Record<string, number> = { ready: 0, applied: 0, screening: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 };
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

      const totalMatches = allMatches.length;
      const avgScore = totalMatches > 0 ? Math.round(allMatches.reduce((s: number, m: any) => s + m.fit_score, 0) / totalMatches) : 0;
      setStats({
        totalCandidates: cands.length,
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidate_job_matches' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruiter_candidate_assignments' }, () => load())
      .subscribe();
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

  const firstName = profile?.name?.split(' ')[0] || 'Recruiter';

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
        <h1 className="text-lg font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2 mb-1">
          <BarChart3 size={20} className="text-brand-600 dark:text-brand-400" />
          Talent & fit report
        </h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">
          Pipeline summary, best fit candidates, and roles that need attention — for your assigned candidates only.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-4 border border-surface-100 dark:border-surface-600">
            <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums">{stats.totalCandidates}</p>
            <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Candidates</p>
          </div>
          <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-4 border border-surface-100 dark:border-surface-600">
            <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums">{stats.totalMatches}</p>
            <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Total matches</p>
          </div>
          <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-4 border border-surface-100 dark:border-surface-600">
            <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums">{stats.avgScore}</p>
            <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Avg ATS score</p>
          </div>
          <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-4 border border-surface-100 dark:border-surface-600">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.strongMatchCount}</p>
            <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Strong (82+)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Pipeline summary" subtitle="Your candidates' applications by stage" icon={<TrendingUp size={18} className="text-brand-600 dark:text-brand-400" />}>
            <div className="space-y-2">
              {['ready', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'].map(stage => (
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

          <SectionCard title="Best fit candidates" subtitle="Assigned candidates with strongest match scores" icon={<Star size={18} className="text-emerald-600 dark:text-emerald-400" />}>
            {bestFitCandidates.length === 0 ? (
              <p className="text-sm text-surface-500 dark:text-surface-400">No candidates with 75+ matches yet. Run matching to populate.</p>
            ) : (
              <ul className="space-y-2">
                {bestFitCandidates.map((c: any) => (
                  <li key={c.id}>
                    <Link href={`/dashboard/recruiter/candidates/${c.id}`} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors group">
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
          <SectionCard title="Recent top matches" subtitle="Highest-scoring candidate–job pairs" icon={<Target size={18} className="text-violet-600 dark:text-violet-400" />}>
            {topMatches.length === 0 ? (
              <p className="text-sm text-surface-500 dark:text-surface-400">No matches yet.</p>
            ) : (
              <ul className="space-y-2">
                {topMatches.slice(0, 10).map((m: any) => (
                  <li key={m.id}>
                    <Link href={`/dashboard/recruiter/candidates/${m.candidate_id}`} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
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
