'use client';
// src/app/dashboard/admin/reports/page.tsx
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner, StatusBadge } from '@/components/ui';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, FunnelChart, Funnel, LabelList,
  Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  TrendingUp, Users, AlertTriangle, Trophy,
  Briefcase, Target, RefreshCw, Calendar,
  ArrowRight, Clock, CheckCircle2, DollarSign, Download,
  Zap, Lightbulb, BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import { cn, formatDate } from '@/utils/helpers';

type Period = 'week' | 'month' | 'quarter';

const STAGE_ORDER = ['applied', 'screening', 'interview', 'offer'];
const STAGE_COLORS: Record<string, string> = {
  applied: '#6366f1', screening: '#f59e0b',
  interview: '#8b5cf6', offer: '#22c55e', rejected: '#ef4444',
};

function SectionHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-surface-100 dark:bg-surface-700 flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-semibold text-surface-900 dark:text-surface-100">{title}</h2>
        {subtitle && <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="card p-4">
      <p className={cn('text-2xl font-bold', color || 'text-surface-900 dark:text-surface-100')}>{value}</p>
      <p className="text-xs font-medium text-surface-700 dark:text-surface-400 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-surface-400 dark:text-surface-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Custom funnel bar (hand-built — Recharts Funnel is hard to style) ────────
function PipelineFunnel({ data }: { data: { stage: string; count: number; pct: number }[] }) {
  const max = data[0]?.count || 1;
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.stage}>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs text-surface-500 dark:text-surface-400 w-20 capitalize">{d.stage}</span>
            <div className="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-6 overflow-hidden">
              <div
                className="h-full rounded-full flex items-center px-2 transition-all"
                style={{
                  width: `${Math.max(8, (d.count / max) * 100)}%`,
                  backgroundColor: STAGE_COLORS[d.stage] || '#94a3b8',
                }}
              >
                <span className="text-[11px] text-white font-bold">{d.count}</span>
              </div>
            </div>
            <span className="text-xs text-surface-400 dark:text-surface-500 w-12 text-right">
              {i === 0 ? '100%' : `${d.pct.toFixed(0)}%`}
            </span>
          </div>
          {i < data.length - 1 && (
            <div className="flex items-center gap-1 pl-20 mb-1">
              <ArrowRight size={10} className="text-surface-300" />
              <span className="text-[10px] text-surface-400 dark:text-surface-500">
                {data[i + 1].count > 0
                  ? `${((data[i + 1].count / Math.max(1, d.count)) * 100).toFixed(0)}% converted`
                  : 'no conversion'}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AdminReportsPage() {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Data state
  const [funnel, setFunnel] = useState<any[]>([]);
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [stuckCandidates, setStuckCandidates] = useState<any[]>([]);
  const [roleIntel, setRoleIntel] = useState<any[]>([]);
  const [velocityData, setVelocityData] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [heatmap, setHeatmap] = useState<{ companies: any[]; roles: any[]; remote: any[] }>({ companies: [], roles: [], remote: [] });
  const [kpis, setKpis] = useState({ totalApps: 0, totalInterviews: 0, totalOffers: 0, offerRate: 0, avgScore: 0, activeJobs: 0 });
  const [allApplications, setAllApplications] = useState<any[]>([]);
  const [talentFit, setTalentFit] = useState<{
    totalMatches: number;
    strongMatchCount: number;
    jobsNeedingAttention: { id: string; title: string; company: string; matchCount: number; strongCount: number }[];
    topMissingSkills: { skill: string; count: number }[];
  }>({ totalMatches: 0, strongMatchCount: 0, jobsNeedingAttention: [], topMissingSkills: [] });

  const periodStart = useCallback(() => {
    const now = new Date();
    if (period === 'week') return new Date(now.getTime() - 7 * 86400000).toISOString();
    if (period === 'month') return new Date(now.getTime() - 30 * 86400000).toISOString();
    return new Date(now.getTime() - 90 * 86400000).toISOString();
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const since = periodStart();

    const [appRes, matchRes, assignRes, jobRes, profileRes] = await Promise.all([
      // All applications with full relations
      supabase.from('applications')
        .select('*, candidate:candidates(id, full_name, primary_title, updated_at), job:jobs(id, title, company, remote_type, job_type)')
        .order('updated_at', { ascending: false }),
      // Matches for avg score and talent/fit analysis (job_id, missing_keywords)
      supabase.from('candidate_job_matches').select('fit_score, candidate_id, job_id, missing_keywords'),
      // Assignments with recruiter info
      supabase.from('recruiter_candidate_assignments')
        .select('recruiter_id, candidate_id, recruiter:profiles!recruiter_id(id, name, email)'),
      // Jobs for heatmap
      supabase.from('jobs').select('id, title, company, remote_type, job_type, salary_min, salary_max, is_active').eq('is_active', true),
      // Recruiters
      supabase.from('profiles').select('id, name, email').eq('role', 'recruiter'),
    ]);

    const err = appRes.error?.message || matchRes.error?.message || assignRes.error?.message || jobRes.error?.message || profileRes.error?.message;
    if (err) {
      setLoadError(err);
      setLoading(false);
      return;
    }

    const allApps = appRes.data || [];
    setAllApplications(allApps);
    const allMatches = matchRes.data || [];
    const allAssignments = assignRes.data || [];
    const allJobs = jobRes.data || [];
    const allRecruiters = profileRes.data || [];

    const periodApps = allApps.filter(a => a.updated_at >= since);

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const totalApps = periodApps.length;
    const totalInterviews = allApps.filter(a => ['interview', 'offer'].includes(a.status)).length;
    const totalOffers = allApps.filter(a => a.status === 'offer').length;
    const offerRate = allApps.length > 0 ? parseFloat(((totalOffers / allApps.length) * 100).toFixed(1)) : 0;
    const avgScore = allMatches.length > 0
      ? Math.round(allMatches.reduce((s, m) => s + m.fit_score, 0) / allMatches.length)
      : 0;
    setKpis({ totalApps, totalInterviews, totalOffers, offerRate, avgScore, activeJobs: allJobs.length });

    // ── Talent & fit analysis (platform-wide) ──────────────────────────────────
    const SCORE_STRONG = 82;
    const totalMatches = allMatches.length;
    const strongMatchCount = allMatches.filter((m: any) => m.fit_score >= SCORE_STRONG).length;
    const jobMatchCount: Record<string, { count: number; strong: number }> = {};
    for (const j of allJobs) {
      jobMatchCount[j.id] = { count: 0, strong: 0 };
    }
    for (const m of allMatches) {
      const jid = m.job_id;
      if (jobMatchCount[jid]) {
        jobMatchCount[jid].count++;
        if (m.fit_score >= SCORE_STRONG) jobMatchCount[jid].strong++;
      }
    }
    const jobsNeedingAttention = allJobs
      .map((j: any) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        matchCount: jobMatchCount[j.id]?.count ?? 0,
        strongCount: jobMatchCount[j.id]?.strong ?? 0,
      }))
      .filter((j: any) => j.matchCount === 0 || j.strongCount === 0)
      .sort((a: any, b: any) => a.matchCount - b.matchCount)
      .slice(0, 10);
    const missingAgg: Record<string, number> = {};
    for (const m of allMatches) {
      for (const k of (m.missing_keywords || []) as string[]) {
        const key = String(k).trim().toLowerCase();
        if (key) missingAgg[key] = (missingAgg[key] || 0) + 1;
      }
    }
    const topMissingSkills = Object.entries(missingAgg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));
    setTalentFit({ totalMatches, strongMatchCount, jobsNeedingAttention, topMissingSkills });

    // ── Pipeline Funnel ───────────────────────────────────────────────────────
    const funnelData = STAGE_ORDER.map(stage => ({
      stage,
      count: allApps.filter(a => a.status === stage || (stage === 'applied' && !['ready'].includes(a.status))).length,
      pct: 0,
    }));
    // fix: applied = all non-ready
    funnelData[0].count = allApps.filter(a => a.status !== 'ready').length;
    const baseCount = funnelData[0].count || 1;
    funnelData.forEach(d => { d.pct = (d.count / baseCount) * 100; });
    setFunnel(funnelData);

    // ── Recruiter Leaderboard ─────────────────────────────────────────────────
    const recruiterStats = allRecruiters.map(rec => {
      const assignedIds = allAssignments
        .filter(a => a.recruiter_id === rec.id)
        .map(a => a.candidate_id);

      const recApps = allApps.filter(a => assignedIds.includes(a.candidate_id));
      const recPeriodApps = recApps.filter(a => a.updated_at >= since);
      const interviews = recApps.filter(a => ['interview', 'offer'].includes(a.status)).length;
      const recOffers = recApps.filter(a => a.status === 'offer').length;
      const interviewRate = recApps.length > 0 ? parseFloat(((interviews / recApps.length) * 100).toFixed(1)) : 0;
      const offerRateRec = recApps.length > 0 ? parseFloat(((recOffers / recApps.length) * 100).toFixed(1)) : 0;

      // Efficiency: weighted score 0–100
      const efficiency = Math.min(100, Math.round(
        (assignedIds.length * 5) +
        (recPeriodApps.length * 10) +
        (interviewRate * 1.5) +
        (offerRateRec * 3)
      ));

      return {
        id: rec.id,
        name: rec.name || rec.email,
        email: rec.email,
        candidates_assigned: assignedIds.length,
        applications_submitted: recApps.length,
        period_applications: recPeriodApps.length,
        interviews_secured: interviews,
        offers_received: recOffers,
        interview_rate: interviewRate,
        offer_rate: offerRateRec,
        efficiency_score: efficiency,
      };
    }).sort((a, b) => b.efficiency_score - a.efficiency_score);
    setRecruiters(recruiterStats);

    // ── Stuck Candidates (14+ days in same status) ────────────────────────────
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const stuck = allApps
      .filter(a =>
        ['applied', 'screening', 'interview'].includes(a.status) &&
        a.updated_at < fourteenDaysAgo
      )
      .map(a => {
        const daysDiff = Math.floor((Date.now() - new Date(a.updated_at).getTime()) / 86400000);
        const assignment = allAssignments.find(asgn => asgn.candidate_id === a.candidate_id);
        const recruiter = allRecruiters.find(r => r.id === assignment?.recruiter_id);
        return {
          id: a.id,
          candidate_name: (a.candidate as any)?.full_name || 'Unknown',
          candidate_id: a.candidate_id,
          job_title: (a.job as any)?.title || 'Unknown',
          company: (a.job as any)?.company || '—',
          status: a.status,
          days_stuck: daysDiff,
          recruiter_name: recruiter?.name || recruiter?.email || 'Unassigned',
          updated_at: a.updated_at,
        };
      })
      .sort((a, b) => b.days_stuck - a.days_stuck);
    setStuckCandidates(stuck);

    // ── Role Intelligence ─────────────────────────────────────────────────────
    // Group by job title family (first word of title)
    const roleMap: Record<string, any> = {};
    for (const app of allApps) {
      const title = (app.job as any)?.title || 'Other';
      // Normalize to family (e.g. "Senior Software Engineer" → "Software Engineer")
      const words = title.toLowerCase().replace(/\b(senior|junior|lead|staff|principal|head of)\b/g, '').trim().split(/\s+/);
      const family = words.slice(0, 3).join(' ').trim() || 'Other';
      if (!roleMap[family]) {
        roleMap[family] = { title_family: family, total: 0, screening: 0, interview: 0, offer: 0, rejected: 0 };
      }
      roleMap[family].total++;
      if (['screening', 'interview', 'offer'].includes(app.status)) roleMap[family].screening++;
      if (['interview', 'offer'].includes(app.status)) roleMap[family].interview++;
      if (app.status === 'offer') roleMap[family].offer++;
      if (app.status === 'rejected') roleMap[family].rejected++;
    }
    const roleData = Object.values(roleMap)
      .filter((r: any) => r.total >= 1)
      .map((r: any) => ({
        ...r,
        screening_rate: r.total > 0 ? Math.round((r.screening / r.total) * 100) : 0,
        interview_rate: r.total > 0 ? Math.round((r.interview / r.total) * 100) : 0,
        offer_rate: r.total > 0 ? Math.round((r.offer / r.total) * 100) : 0,
      }))
      .sort((a: any, b: any) => b.interview_rate - a.interview_rate)
      .slice(0, 10);
    setRoleIntel(roleData);

    // ── Application Velocity (weekly buckets) ─────────────────────────────────
    const buckets: Record<string, number> = {};
    const NUM_BUCKETS = period === 'week' ? 7 : period === 'month' ? 4 : 12;
    const bucketSize = period === 'week' ? 1 : period === 'month' ? 7 : 7;
    for (let i = NUM_BUCKETS - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * bucketSize * 86400000);
      const key = period === 'week'
        ? date.toLocaleDateString('en-US', { weekday: 'short' })
        : period === 'month'
        ? `W${NUM_BUCKETS - i}`
        : date.toLocaleDateString('en-US', { month: 'short' });
      buckets[key] = 0;
    }
    for (const app of allApps) {
      const d = new Date(app.created_at);
      const daysAgo = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (daysAgo > NUM_BUCKETS * bucketSize) continue;
      const bucketIdx = Math.floor(daysAgo / bucketSize);
      const keys = Object.keys(buckets);
      const key = keys[keys.length - 1 - bucketIdx];
      if (key) buckets[key]++;
    }
    setVelocityData(Object.entries(buckets).map(([name, count]) => ({ name, count })));

    // ── Offers ────────────────────────────────────────────────────────────────
    const offerApps = allApps
      .filter(a => a.status === 'offer')
      .map(a => ({
        id: a.id,
        candidate_name: (a.candidate as any)?.full_name || 'Unknown',
        job_title: (a.job as any)?.title || 'Unknown',
        company: (a.job as any)?.company || '—',
        offer_details: (a as any).offer_details,
        updated_at: a.updated_at,
      }));
    setOffers(offerApps);

    // ── Job Market Heatmap ────────────────────────────────────────────────────
    // Top companies by job count
    const companyCount: Record<string, number> = {};
    const roleFamilyCount: Record<string, number> = {};
    const remoteCount: Record<string, number> = { remote: 0, hybrid: 0, onsite: 0, unspecified: 0 };

    for (const job of allJobs) {
      companyCount[job.company] = (companyCount[job.company] || 0) + 1;
      const titleWords = (job.title || '').toLowerCase().replace(/\b(senior|junior|lead|staff|principal)\b/g, '').trim().split(/\s+/).slice(0, 2).join(' ');
      roleFamilyCount[titleWords] = (roleFamilyCount[titleWords] || 0) + 1;
      const rt = (job.remote_type || 'unspecified').toLowerCase();
      if (rt.includes('remote')) remoteCount.remote++;
      else if (rt.includes('hybrid')) remoteCount.hybrid++;
      else if (rt.includes('on') || rt.includes('office')) remoteCount.onsite++;
      else remoteCount.unspecified++;
    }

    setHeatmap({
      companies: Object.entries(companyCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
      roles: Object.entries(roleFamilyCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
      remote: [
        { name: 'Remote', count: remoteCount.remote, fill: '#22c55e' },
        { name: 'Hybrid', count: remoteCount.hybrid, fill: '#f59e0b' },
        { name: 'On-site', count: remoteCount.onsite, fill: '#6366f1' },
        { name: 'Unspecified', count: remoteCount.unspecified, fill: '#94a3b8' },
      ].filter(d => d.count > 0),
    });

    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const PERIOD_LABELS: Record<Period, string> = { week: 'Last 7 days', month: 'Last 30 days', quarter: 'Last 90 days' };

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">Reports & Analytics</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">Full pipeline intelligence · {PERIOD_LABELS[period]}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex p-1 bg-surface-100 dark:bg-surface-700 rounded-lg gap-1">
            {(['week', 'month', 'quarter'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn('px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors',
                  period === p ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm' : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300')}>
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              const headers = ['Candidate', 'Job', 'Company', 'Status', 'Applied', 'Updated'];
              const rows = allApplications.map((a: any) => [
                (a.candidate as any)?.full_name ?? '',
                (a.job as any)?.title ?? '',
                (a.job as any)?.company ?? '',
                a.status ?? '',
                a.applied_at ? new Date(a.applied_at).toLocaleDateString() : '',
                a.updated_at ? new Date(a.updated_at).toLocaleDateString() : '',
              ]);
              const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `applications-export-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <Download size={14} /> Export CSV
          </button>
          <button onClick={load} className="btn-ghost text-sm flex items-center gap-1.5">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={28} /></div>
      ) : loadError ? (
        <div className="card p-12 text-center">
          <p className="text-surface-700 font-medium flex items-center justify-center gap-2">
            <AlertTriangle size={20} /> Failed to load reports
          </p>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">{loadError}</p>
          <button type="button" onClick={() => load()} className="btn-primary mt-4">Try again</button>
        </div>
      ) : (
        <>
          {/* ── KPI Row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPI label="Applications" value={kpis.totalApps} sub={PERIOD_LABELS[period]} color="text-brand-600" />
            <KPI label="In Interview" value={kpis.totalInterviews} color="text-purple-600" />
            <KPI label="Offers" value={kpis.totalOffers} color="text-green-600" />
            <KPI label="Offer Rate" value={`${kpis.offerRate}%`} color="text-green-600" />
            <KPI label="Avg ATS Score" value={kpis.avgScore || '—'} color="text-amber-600" />
            <KPI label="Active Jobs" value={kpis.activeJobs} color="text-surface-700" />
          </div>

          {/* ── Stuck Candidates Alert ── */}
          {stuckCandidates.length > 0 && (
            <div className="card overflow-hidden border-amber-200 dark:border-amber-500/40">
              <div className="px-5 py-4 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-500/40 flex items-center gap-3">
                <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {stuckCandidates.length} candidate{stuckCandidates.length > 1 ? 's' : ''} stuck for 14+ days
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-300">These need immediate recruiter attention</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 dark:bg-surface-700/50 border-b border-surface-100 dark:border-surface-600">
                    <tr>
                      {['Candidate', 'Role', 'Status', 'Days Stuck', 'Recruiter', 'Last Update'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-surface-600 dark:text-surface-300">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50 dark:divide-surface-700">
                    {stuckCandidates.slice(0, 8).map(c => (
                      <tr key={c.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                        <td className="px-4 py-2.5 font-medium text-surface-900 dark:text-surface-100">{c.candidate_name}</td>
                        <td className="px-4 py-2.5 text-surface-600 dark:text-surface-300">
                          <p className="text-xs">{c.job_title}</p>
                          <p className="text-[10px] text-surface-400 dark:text-surface-500">{c.company}</p>
                        </td>
                        <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                        <td className="px-4 py-2.5">
                          <span className={cn('font-bold text-sm', c.days_stuck > 30 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
                            {c.days_stuck}d
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-surface-600 dark:text-surface-300 text-xs">{c.recruiter_name}</td>
                        <td className="px-4 py-2.5 text-surface-400 dark:text-surface-500 text-xs">{formatDate(c.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Talent & fit analysis (platform-wide) ── */}
          <div className="rounded-2xl border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 rounded-xl bg-brand-500/10 dark:bg-brand-500/20 flex items-center justify-center shrink-0">
                <BarChart3 size={18} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-surface-900 dark:text-surface-100">Talent & fit analysis</h2>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Platform-wide match quality and gaps</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="card p-4">
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">{talentFit.totalMatches}</p>
                <p className="text-xs font-medium text-surface-600 dark:text-surface-400 mt-0.5">Total matches</p>
              </div>
              <div className="card p-4">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{kpis.avgScore || '—'}</p>
                <p className="text-xs font-medium text-surface-600 dark:text-surface-400 mt-0.5">Avg ATS score</p>
              </div>
              <div className="card p-4">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{talentFit.strongMatchCount}</p>
                <p className="text-xs font-medium text-surface-600 dark:text-surface-400 mt-0.5">Strong fits (82+)</p>
              </div>
              <div className="card p-4">
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">{talentFit.jobsNeedingAttention.length}</p>
                <p className="text-xs font-medium text-surface-600 dark:text-surface-400 mt-0.5">Roles needing attention</p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={16} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-surface-800">Jobs with no or few strong matches</h3>
                </div>
                <p className="text-xs text-surface-500 dark:text-surface-400 mb-3">Roles that may need sourcing or better job descriptions</p>
                {talentFit.jobsNeedingAttention.length === 0 ? (
                  <p className="text-sm text-surface-400 dark:text-surface-500">All active jobs have at least one strong-fit candidate.</p>
                ) : (
                  <ul className="space-y-2">
                    {talentFit.jobsNeedingAttention.map((j) => (
                      <li key={j.id} className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-surface-50 dark:bg-surface-700/50 border border-surface-100 dark:border-surface-600">
                        <div className="min-w-0">
                          <p className="font-medium text-surface-900 dark:text-surface-100 truncate">{j.title}</p>
                          <p className="text-xs text-surface-500 dark:text-surface-400">{j.company}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-xs text-surface-500 dark:text-surface-400">{j.matchCount} matches</span>
                          <span className={cn('text-xs font-semibold', j.strongCount === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-surface-600 dark:text-surface-300')}>
                            {j.strongCount} strong
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/dashboard/admin/jobs" className="text-xs font-medium text-brand-600 hover:underline mt-2 inline-block">View all jobs →</Link>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb size={16} className="text-purple-500" />
                  <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Top missing skills (candidate pool)</h3>
                </div>
                <p className="text-xs text-surface-500 dark:text-surface-400 mb-3">Skills most often missing vs. job requirements — consider training or hiring</p>
                {talentFit.topMissingSkills.length === 0 ? (
                  <p className="text-sm text-surface-400 dark:text-surface-500">No missing-keyword data yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {talentFit.topMissingSkills.map(({ skill, count }) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-100 dark:bg-surface-600 text-surface-700 dark:text-surface-200 text-xs font-medium"
                      >
                        {skill}
                        <span className="text-surface-400 dark:text-surface-500">×{count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Pipeline Funnel ── */}
            <div className="card p-5">
              <SectionHeader
                title="Pipeline Funnel"
                subtitle="Application → Offer conversion"
                icon={<Target size={16} className="text-brand-600" />}
              />
              <PipelineFunnel data={funnel} />
              <div className="mt-4 pt-4 border-t border-surface-100 dark:border-surface-600 grid grid-cols-2 gap-2">
                {funnel.slice(1).map((f, i) => (
                  <div key={f.stage} className="text-xs text-surface-500">
                    <span className="font-medium capitalize">{STAGE_ORDER[i]} → {f.stage}</span>:{' '}
                    <span className="font-bold text-surface-800">
                      {funnel[i].count > 0 ? `${((f.count / funnel[i].count) * 100).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Application Velocity ── */}
            <div className="card p-5">
              <SectionHeader
                title="Application Velocity"
                subtitle={`Applications submitted — ${PERIOD_LABELS[period]}`}
                icon={<TrendingUp size={16} className="text-purple-600" />}
              />
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={velocityData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    formatter={(v: any) => [v, 'Applications']}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Recruiter Leaderboard ── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-600">
              <SectionHeader
                title="Recruiter Leaderboard"
                subtitle="Performance & efficiency breakdown per recruiter"
                icon={<Trophy size={16} className="text-amber-500" />}
              />
            </div>
            {recruiters.length === 0 ? (
              <p className="p-5 text-sm text-surface-400">No recruiters found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 dark:bg-surface-700/50 border-b border-surface-100 dark:border-surface-600">
                    <tr>
                      {['#', 'Recruiter', 'Assigned', `Apps (${period})`, 'Total Apps', 'Interviews', 'Offers', 'Interview %', 'Offer %', 'Efficiency'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-surface-600 dark:text-surface-300 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50 dark:divide-surface-700">
                    {recruiters.map((r, i) => (
                      <tr key={r.id} className={cn('hover:bg-surface-50 dark:hover:bg-surface-700/50', i === 0 && 'bg-amber-50/50 dark:bg-amber-900/20')}>
                        <td className="px-4 py-3">
                          {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : (
                            <span className="text-xs text-surface-400 dark:text-surface-500">{i + 1}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-surface-900 dark:text-surface-100">{r.name}</p>
                          <p className="text-[10px] text-surface-400 dark:text-surface-500">{r.email}</p>
                        </td>
                        <td className="px-4 py-3 font-bold text-brand-600 dark:text-brand-400">{r.candidates_assigned}</td>
                        <td className="px-4 py-3 text-purple-600 dark:text-purple-400 font-semibold">{r.period_applications}</td>
                        <td className="px-4 py-3 text-surface-600 dark:text-surface-300">{r.applications_submitted}</td>
                        <td className="px-4 py-3 text-purple-600 dark:text-purple-400">{r.interviews_secured}</td>
                        <td className="px-4 py-3 text-green-600 dark:text-green-400 font-semibold">{r.offers_received}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
                              <div className="bg-purple-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, r.interview_rate)}%` }} />
                            </div>
                            <span className="text-xs">{r.interview_rate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
                              <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, r.offer_rate * 5)}%` }} />
                            </div>
                            <span className="text-xs">{r.offer_rate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
                              <div
                                className={cn('h-1.5 rounded-full', r.efficiency_score >= 70 ? 'bg-green-400' : r.efficiency_score >= 40 ? 'bg-yellow-400' : 'bg-red-400')}
                                style={{ width: `${Math.min(100, r.efficiency_score)}%` }}
                              />
                            </div>
                            <span className={cn('text-xs font-bold', r.efficiency_score >= 70 ? 'text-green-600 dark:text-green-400' : r.efficiency_score >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400')}>
                              {r.efficiency_score}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Role Intelligence ── */}
          <div className="card p-5">
            <SectionHeader
              title="Role Intelligence"
              subtitle="Which job types are converting to interviews and offers"
              icon={<Briefcase size={16} className="text-indigo-600" />}
            />
            {roleIntel.length === 0 ? (
              <p className="text-sm text-surface-400 dark:text-surface-500">No application data yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-surface-100 dark:border-surface-600">
                    <tr>
                      {['Role', 'Applications', 'Screenings', 'Interviews', 'Offers', 'Interview Rate', 'Offer Rate'].map(h => (
                        <th key={h} className="pb-2 text-left text-xs font-semibold text-surface-500 dark:text-surface-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50 dark:divide-surface-700">
                    {roleIntel.map((r, i) => (
                      <tr key={i} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                        <td className="py-2.5 pr-4 font-medium text-surface-900 dark:text-surface-100 capitalize max-w-[160px] truncate">{r.title_family}</td>
                        <td className="py-2.5 pr-4 text-surface-600 dark:text-surface-300">{r.total}</td>
                        <td className="py-2.5 pr-4 text-yellow-600 dark:text-yellow-400">{r.screening}</td>
                        <td className="py-2.5 pr-4 text-purple-600 dark:text-purple-400 font-semibold">{r.interview}</td>
                        <td className="py-2.5 pr-4 text-green-600 dark:text-green-400 font-bold">{r.offer}</td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
                              <div className="bg-purple-400 h-1.5 rounded-full" style={{ width: `${r.interview_rate}%` }} />
                            </div>
                            <span className={cn('text-xs font-semibold', r.interview_rate >= 30 ? 'text-green-600 dark:text-green-400' : r.interview_rate >= 15 ? 'text-yellow-600 dark:text-yellow-400' : 'text-surface-500 dark:text-surface-400')}>
                              {r.interview_rate}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span className={cn('text-xs font-bold', r.offer_rate >= 10 ? 'text-green-600 dark:text-green-400' : 'text-surface-400 dark:text-surface-500')}>
                            {r.offer_rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Job Market Heatmap ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Companies */}
            <div className="card p-5">
              <SectionHeader
                title="Top Hiring Companies"
                subtitle="By active job count"
                icon={<Briefcase size={16} className="text-brand-600" />}
              />
              <div className="space-y-2">
                {heatmap.companies.slice(0, 8).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="text-xs text-surface-400 dark:text-surface-500 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-surface-800 dark:text-surface-200 truncate">{c.name}</span>
                        <span className="text-xs text-surface-500 dark:text-surface-400 ml-2 shrink-0">{c.count}</span>
                      </div>
                      <div className="w-full bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
                        <div className="bg-brand-400 h-1.5 rounded-full"
                          style={{ width: `${(c.count / (heatmap.companies[0]?.count || 1)) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                {heatmap.companies.length === 0 && <p className="text-sm text-surface-400 dark:text-surface-500">No job data</p>}
              </div>
            </div>

            {/* Top Roles */}
            <div className="card p-5">
              <SectionHeader
                title="Top Job Roles"
                subtitle="Most in-demand role families"
                icon={<Target size={16} className="text-purple-600" />}
              />
              <div className="space-y-2">
                {heatmap.roles.slice(0, 8).map((r, i) => (
                  <div key={r.name} className="flex items-center gap-3">
                    <span className="text-xs text-surface-400 dark:text-surface-500 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-surface-800 dark:text-surface-200 truncate capitalize">{r.name}</span>
                        <span className="text-xs text-surface-500 dark:text-surface-400 ml-2 shrink-0">{r.count}</span>
                      </div>
                      <div className="w-full bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
                        <div className="bg-purple-400 h-1.5 rounded-full"
                          style={{ width: `${(r.count / (heatmap.roles[0]?.count || 1)) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                {heatmap.roles.length === 0 && <p className="text-sm text-surface-400 dark:text-surface-500">No job data</p>}
              </div>
            </div>

            {/* Remote breakdown */}
            <div className="card p-5">
              <SectionHeader
                title="Work Type Breakdown"
                subtitle="Remote vs hybrid vs on-site"
                icon={<Calendar size={16} className="text-green-600" />}
              />
              {heatmap.remote.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={heatmap.remote} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                        {heatmap.remote.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-2">
                    {heatmap.remote.map(r => (
                      <div key={r.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.fill }} />
                          <span className="text-surface-600 dark:text-surface-300">{r.name}</span>
                        </div>
                        <span className="font-medium text-surface-800 dark:text-surface-200">{r.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-sm text-surface-400 dark:text-surface-500">No job data</p>}
            </div>
          </div>

          {/* ── Offers Table ── */}
          {offers.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-600">
                <SectionHeader
                  title="Active Offers"
                  subtitle="Candidates currently at offer stage"
                  icon={<DollarSign size={16} className="text-green-600 dark:text-green-400" />}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 dark:bg-surface-700/50 border-b border-surface-100 dark:border-surface-600">
                    <tr>
                      {['Candidate', 'Role', 'Company', 'Offered Salary', 'Notes', 'Since'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-surface-600 dark:text-surface-300">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50 dark:divide-surface-700">
                    {offers.map(o => (
                      <tr key={o.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                        <td className="px-4 py-3 font-medium text-surface-900 dark:text-surface-100">{o.candidate_name}</td>
                        <td className="px-4 py-3 text-surface-600 dark:text-surface-300">{o.job_title}</td>
                        <td className="px-4 py-3 text-surface-600 dark:text-surface-300">{o.company}</td>
                        <td className="px-4 py-3 text-green-600 dark:text-green-400 font-semibold">
                          {o.offer_details?.salary ? `$${o.offer_details.salary.toLocaleString()}` : <span className="text-surface-300 dark:text-surface-500 italic text-xs">Not captured</span>}
                        </td>
                        <td className="px-4 py-3 text-surface-500 dark:text-surface-400 text-xs max-w-[180px] truncate">
                          {o.offer_details?.notes || '—'}
                        </td>
                        <td className="px-4 py-3 text-surface-400 dark:text-surface-500 text-xs">{formatDate(o.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}