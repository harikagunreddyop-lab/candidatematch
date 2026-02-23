'use client';
// src/app/dashboard/candidate/reports/page.tsx
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner, StatusBadge } from '@/components/ui';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Sparkles, TrendingUp, Target, Brain, ArrowUp,
  CheckCircle2, AlertCircle, Zap, Clock, RefreshCw,
  Lightbulb, BarChart2, Globe,
} from 'lucide-react';
import { cn, formatDate } from '@/utils/helpers';

function SectionHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-semibold text-surface-900">{title}</h2>
        {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function ScoreBar({ score, max = 100, color = 'bg-brand-500' }: { score: number; max?: number; color?: string }) {
  return (
    <div className="w-full bg-surface-100 rounded-full h-2">
      <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${Math.min(100, (score / max) * 100)}%` }} />
    </div>
  );
}

export default function CandidateReportsPage() {
  const supabase = createClient();
  const [candidate, setCandidate] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  // AI Brief
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefGeneratedAt, setBriefGeneratedAt] = useState<string | null>(null);

  // Market jobs (for demand analysis)
  const [marketJobs, setMarketJobs] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: cand } = await supabase
        .from('candidates')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (!cand) { setNotLinked(true); setLoading(false); return; }
      setCandidate(cand);

      const [matchRes, appRes, jobRes] = await Promise.all([
        supabase.from('candidate_job_matches')
          .select('*, job:jobs(id, title, company, location, remote_type)')
          .eq('candidate_id', cand.id)
          .order('fit_score', { ascending: false }),
        supabase.from('applications')
          .select('*, job:jobs(title, company)')
          .eq('candidate_id', cand.id)
          .order('updated_at', { ascending: false }),
        // Fetch ALL active jobs to find market demand for their title family
        supabase.from('jobs')
          .select('id, title, jd_clean, jd_raw')
          .eq('is_active', true)
          .limit(500),
      ]);

      setMatches(matchRes.data || []);
      setApplications(appRes.data || []);
      setMarketJobs(jobRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const generateBrief = async () => {
    if (!candidate) return;
    setBriefLoading(true);
    setBriefError(null);
    try {
      const res = await fetch('/api/candidate-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: candidate.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setBrief(data.brief);
      setBriefGeneratedAt(data.generated_at);
    } catch (e: any) {
      setBriefError(e.message);
    }
    setBriefLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;

  if (notLinked) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <AlertCircle size={32} className="text-surface-300" />
      <p className="text-sm text-surface-500">Your account isn&apos;t linked to a candidate profile yet. Contact your recruiter.</p>
    </div>
  );

  // ── Derived analytics ──────────────────────────────────────────────────────
  const totalMatches = matches.length;
  const avgScore = totalMatches > 0 ? Math.round(matches.reduce((s, m) => s + m.fit_score, 0) / totalMatches) : 0;
  const topScore = matches[0]?.fit_score || 0;
  const interviewReady = matches.filter(m => m.fit_score >= 82).length;

  // ── ATS Score Distribution (for chart) ──────────────────────────────────
  const buckets = [
    { label: '<40', min: 0, max: 40, color: '#fca5a5' },
    { label: '40–49', min: 40, max: 50, color: '#fdba74' },
    { label: '50–59', min: 50, max: 60, color: '#fde68a' },
    { label: '60–69', min: 60, max: 70, color: '#fde68a' },
    { label: '70–79', min: 70, max: 80, color: '#86efac' },
    { label: '80–89', min: 80, max: 90, color: '#4ade80' },
    { label: '90+', min: 90, max: 101, color: '#22c55e' },
  ].map(b => ({ ...b, count: matches.filter(m => m.fit_score >= b.min && m.fit_score < b.max).length }));

  // ── Skill Gap Tracker ───────────────────────────────────────────────────
  const missingFreq: Record<string, { count: number; jobs: string[] }> = {};
  for (const m of matches) {
    for (const skill of (m.missing_keywords || [])) {
      if (!missingFreq[skill]) missingFreq[skill] = { count: 0, jobs: [] };
      missingFreq[skill].count++;
      const jobTitle = m.job?.title;
      if (jobTitle && missingFreq[skill].jobs.length < 3) missingFreq[skill].jobs.push(jobTitle);
    }
  }
  const candidateSkills = new Set((candidate.skills || []).map((s: string) => s.toLowerCase()));
  const topGaps = Object.entries(missingFreq)
    .filter(([skill]) => !candidateSkills.has(skill.toLowerCase()))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([skill, data]) => ({
      skill,
      count: data.count,
      jobs: data.jobs,
      // Estimate score boost: if missing in N jobs, adding it might boost avg score
      estimatedBoost: Math.min(15, Math.round((data.count / Math.max(1, totalMatches)) * 20)),
      pct: Math.round((data.count / Math.max(1, totalMatches)) * 100),
    }));

  // ── Market Demand — top skills in all active job JDs matching title ────────
  const titleWords = (candidate.primary_title || '').toLowerCase().split(/\s+/);
  const relevantJobs = marketJobs.filter(j => {
    const t = (j.title || '').toLowerCase();
    return titleWords.some((w: string) => w.length > 3 && t.includes(w));
  });

  const marketSkillFreq: Record<string, number> = {};
  const COMMON_SKILLS = [
    'python', 'javascript', 'typescript', 'react', 'node', 'java', 'sql', 'aws', 'docker',
    'kubernetes', 'git', 'api', 'agile', 'scrum', 'machine learning', 'data', 'cloud',
    'postgresql', 'mongodb', 'redis', 'graphql', 'rest', 'ci/cd', 'linux', 'excel',
    'tableau', 'power bi', 'salesforce', 'figma', 'product', 'ux', 'analytics',
    'communication', 'leadership', 'management', 'c++', 'go', 'rust', 'swift', 'kotlin',
    'spark', 'hadoop', 'tensorflow', 'pytorch', 'azure', 'gcp', 'terraform', 'ansible',
  ];
  for (const job of relevantJobs) {
    const text = ((job.jd_clean || job.jd_raw || '') + ' ' + (job.title || '')).toLowerCase();
    for (const skill of COMMON_SKILLS) {
      if (text.includes(skill)) {
        marketSkillFreq[skill] = (marketSkillFreq[skill] || 0) + 1;
      }
    }
  }
  const marketDemand = Object.entries(marketSkillFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([skill, count]) => ({
      skill,
      count,
      have: candidateSkills.has(skill),
      pct: Math.round((count / Math.max(1, relevantJobs.length)) * 100),
    }));

  // ── Application Timeline ─────────────────────────────────────────────────
  const STATUS_ORDER = ['ready', 'applied', 'screening', 'interview', 'offer'];
  const STATUS_ICONS: Record<string, React.ReactNode> = {
    applied: <CheckCircle2 size={12} className="text-blue-500" />,
    screening: <Clock size={12} className="text-yellow-500" />,
    interview: <Target size={12} className="text-purple-500" />,
    offer: <Zap size={12} className="text-green-500" />,
    rejected: <AlertCircle size={12} className="text-red-400" />,
  };
  const STATUS_COLORS_TEXT: Record<string, string> = {
    applied: 'text-blue-600', screening: 'text-yellow-600',
    interview: 'text-purple-600', offer: 'text-green-600',
    rejected: 'text-red-500', ready: 'text-surface-400', withdrawn: 'text-surface-400',
  };

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">My Career Report</h1>
          <p className="text-sm text-surface-500 mt-1">
            Personalized insights for {candidate.full_name} · {candidate.primary_title}
          </p>
        </div>
      </div>

      {/* ── Quick KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Matches', value: totalMatches, color: 'text-brand-600', sub: 'jobs matched' },
          { label: 'Avg ATS Score', value: avgScore || '—', color: avgScore >= 70 ? 'text-green-600' : avgScore >= 50 ? 'text-yellow-600' : 'text-red-500', sub: 'out of 100' },
          { label: 'Interview Ready', value: interviewReady, color: 'text-purple-600', sub: 'score 80+' },
          { label: 'Applications', value: applications.length, color: 'text-surface-700', sub: 'submitted' },
        ].map(k => (
          <div key={k.label} className="card p-4">
            <p className={cn('text-2xl font-bold', k.color)}>{k.value}</p>
            <p className="text-xs font-medium text-surface-700 mt-0.5">{k.label}</p>
            <p className="text-[10px] text-surface-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── AI Weekly Brief ── */}
      <div className="card p-6">
        <SectionHeader
          title="AI Weekly Brief"
          subtitle="Personalized career progress summary powered by AI"
          icon={<Sparkles size={16} className="text-brand-600" />}
        />
        {!brief && !briefLoading && (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-surface-600">
              Get a personalized AI analysis of your job search progress — ATS score trends, top skill gaps to fix, and one concrete action item for this week.
            </p>
            <button onClick={generateBrief} className="btn-primary flex items-center gap-2">
              <Brain size={14} /> Generate This Week&apos;s Brief
            </button>
          </div>
        )}
        {briefLoading && (
          <div className="flex items-center gap-3 py-6">
            <Spinner size={18} />
            <p className="text-sm text-surface-500">Analyzing your job search data…</p>
          </div>
        )}
        {briefError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={14} /> {briefError}
          </div>
        )}
        {brief && (
          <div className="space-y-4">
            <div className="bg-surface-50 rounded-xl p-5 text-sm text-surface-700 leading-relaxed whitespace-pre-wrap border border-surface-100">
              {brief}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-surface-400">
                {briefGeneratedAt ? `Generated ${formatDate(briefGeneratedAt)}` : 'Just generated'}
              </p>
              <button onClick={generateBrief} disabled={briefLoading}
                className="btn-ghost text-xs flex items-center gap-1.5 text-brand-600">
                <RefreshCw size={11} /> Regenerate
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── ATS Score Distribution ── */}
        <div className="card p-5">
          <SectionHeader
            title="ATS Score Distribution"
            subtitle="How your profile scores across all matched jobs"
            icon={<BarChart2 size={16} className="text-purple-600" />}
          />
          {totalMatches === 0 ? (
            <p className="text-sm text-surface-400">No matches yet</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={buckets} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    formatter={(v: any) => [v, 'Jobs']}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {buckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-red-50 p-2">
                  <p className="text-sm font-bold text-red-600">{matches.filter(m => m.fit_score < 75).length}</p>
                  <p className="text-[10px] text-red-500">Cannot apply (&lt;75)</p>
                </div>
                <div className="rounded-lg bg-yellow-50 p-2">
                  <p className="text-sm font-bold text-yellow-600">{matches.filter(m => m.fit_score >= 75 && m.fit_score < 82).length}</p>
                  <p className="text-[10px] text-yellow-500">Apply with caution</p>
                </div>
                <div className="rounded-lg bg-green-50 p-2">
                  <p className="text-sm font-bold text-green-600">{interviewReady}</p>
                  <p className="text-[10px] text-green-500">Strong match (82+)</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Application Timeline ── */}
        <div className="card p-5">
          <SectionHeader
            title="Application Timeline"
            subtitle="Status progression for all your applications"
            icon={<Clock size={16} className="text-indigo-600" />}
          />
          {applications.length === 0 ? (
            <p className="text-sm text-surface-400">No applications yet</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {applications.map(a => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="mt-1 shrink-0">{STATUS_ICONS[a.status] || STATUS_ICONS.applied}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-surface-900 truncate">{a.job?.title}</p>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="text-xs text-surface-500">{a.job?.company}</p>
                    <p className="text-[10px] text-surface-400 mt-0.5">{formatDate(a.updated_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {applications.length > 0 && (
            <div className="mt-4 pt-4 border-t border-surface-100">
              <div className="flex gap-1 items-center">
                {['applied', 'screening', 'interview', 'offer'].map((s, i, arr) => {
                  const count = applications.filter(a => a.status === s).length;
                  const active = count > 0;
                  return (
                    <div key={s} className={cn('flex items-center', i < arr.length - 1 && 'flex-1')}>
                      <div className="flex flex-col items-center">
                        <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2',
                          active ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-surface-200 text-surface-400')}>
                          {count || i + 1}
                        </div>
                        <span className="text-[9px] text-surface-400 mt-0.5 capitalize">{s}</span>
                      </div>
                      {i < arr.length - 1 && (
                        <div className={cn('flex-1 h-0.5 mx-0.5 -mt-3',
                          applications.filter(a => ['screening', 'interview', 'offer'].slice(i).includes(a.status)).length > 0
                            ? 'bg-brand-400' : 'bg-surface-100')} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Skill Gap Tracker ── */}
      <div className="card p-5">
        <SectionHeader
          title="Skill Gap Tracker"
          subtitle="Skills you're missing across your top job matches — fix these to unlock more interviews"
          icon={<Target size={16} className="text-red-500" />}
        />
        {topGaps.length === 0 ? (
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <p className="text-sm text-green-700">Great news — no significant skill gaps detected in your top matches!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {topGaps.slice(0, 3).map((g, i) => (
                <div key={g.skill} className={cn(
                  'rounded-xl p-4 border',
                  i === 0 ? 'border-red-200 bg-red-50' : i === 1 ? 'border-amber-200 bg-amber-50' : 'border-yellow-200 bg-yellow-50'
                )}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className={cn('text-sm font-bold capitalize', i === 0 ? 'text-red-700' : i === 1 ? 'text-amber-700' : 'text-yellow-700')}>
                      {i === 0 ? '🔴' : i === 1 ? '🟡' : '🟠'} {g.skill}
                    </p>
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                      i === 0 ? 'bg-red-100 text-red-600' : i === 1 ? 'bg-amber-100 text-amber-600' : 'bg-yellow-100 text-yellow-600')}>
                      {g.count} jobs
                    </span>
                  </div>
                  <p className="text-xs text-surface-600">Missing in {g.pct}% of your matches</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUp size={10} className="text-green-500" />
                    <p className="text-xs text-green-600 font-medium">~{g.estimatedBoost}pt score boost if added</p>
                  </div>
                  {g.jobs.length > 0 && (
                    <p className="text-[10px] text-surface-400 mt-1 truncate">e.g. {g.jobs.join(', ')}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {topGaps.slice(3).map(g => (
                <div key={g.skill} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-surface-700 w-28 truncate capitalize">{g.skill}</span>
                  <div className="flex-1">
                    <ScoreBar score={g.pct} color={g.pct > 50 ? 'bg-red-400' : g.pct > 25 ? 'bg-amber-400' : 'bg-yellow-300'} />
                  </div>
                  <span className="text-xs text-surface-500 w-16 text-right">{g.count} jobs · +{g.estimatedBoost}pt</span>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-brand-50 rounded-lg border border-brand-100">
              <p className="text-xs text-brand-700">
                <span className="font-semibold">💡 Top recommendation:</span> Adding{' '}
                <strong>{topGaps[0]?.skill}</strong> could improve your match rate by ~{topGaps[0]?.estimatedBoost} points and make you competitive for {topGaps[0]?.count} more jobs.
                Look for a relevant course, open source project, or certification to add it to your profile.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Market Demand ── */}
      <div className="card p-5">
        <SectionHeader
          title="Market Skill Demand"
          subtitle={`What ${candidate.primary_title} roles require — green = you have it, red = you don't`}
          icon={<Globe size={16} className="text-blue-500" />}
        />
        {marketDemand.length === 0 ? (
          <p className="text-sm text-surface-400">
            {relevantJobs.length === 0
              ? 'No active jobs found matching your title. More data will appear after the next scrape.'
              : 'No skill data extracted from job descriptions yet.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {marketDemand.slice(0, 12).map(d => (
                <div key={d.skill} className="flex items-center gap-3">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', d.have ? 'bg-green-500' : 'bg-red-400')} />
                  <span className={cn('text-xs capitalize', d.have ? 'text-surface-700' : 'text-surface-900 font-medium')}>
                    {d.skill}
                  </span>
                  <div className="flex-1">
                    <div className="w-full bg-surface-100 rounded-full h-1.5">
                      <div
                        className={cn('h-1.5 rounded-full', d.have ? 'bg-green-400' : 'bg-red-400')}
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-surface-400 w-8 text-right">{d.pct}%</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                <span className="text-surface-600">You have this skill</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                <span className="text-surface-600">Skill gap</span>
              </span>
              <span className="text-surface-400 ml-auto">{relevantJobs.length} active jobs analyzed</span>
            </div>
          </>
        )}
      </div>

      {/* ── Top Matches Snapshot ── */}
      {matches.length > 0 && (
        <div className="card p-5">
          <SectionHeader
            title="Top 5 Job Matches"
            subtitle="Your highest-scoring opportunities right now"
            icon={<TrendingUp size={16} className="text-green-600" />}
          />
          <div className="space-y-3">
            {matches.slice(0, 5).map(m => {
              const applied = applications.some(a => a.job_id === m.job_id);
              return (
                <div key={m.id} className="flex items-center gap-4 p-3 bg-surface-50 rounded-xl">
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm shrink-0',
                    m.fit_score >= 82 ? 'bg-green-100 text-green-700' :
                    m.fit_score >= 75 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')}>
                    {m.fit_score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 truncate">{m.job?.title}</p>
                    <p className="text-xs text-surface-500 truncate">{m.job?.company} · {m.job?.location || 'Location N/A'}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {m.matched_keywords?.slice(0, 3).map((k: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px]">✓ {k}</span>
                      ))}
                    </div>
                  </div>
                  {applied && (
                    <span className="text-xs text-green-600 font-medium shrink-0 flex items-center gap-1">
                      <CheckCircle2 size={11} /> Applied
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}