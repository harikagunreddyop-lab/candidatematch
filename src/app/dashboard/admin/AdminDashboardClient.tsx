'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users, Briefcase, FileText, ClipboardList, TrendingUp,
  Star, ChevronRight, Zap, Search, MapPin, ArrowRight, UserCheck,
} from 'lucide-react';
import { StatusBadge, Spinner } from '@/components/ui';
import { formatRelative, cn } from '@/utils/helpers';
import { getScoreBadgeClasses } from '@/lib/ats-score';

type Stats = {
  candidates: number; jobs: number; resumes: number;
  applications: number; matches: number; recruiters: number;
};
type Pipeline = Record<'ready'|'applied'|'screening'|'interview'|'offer'|'rejected', number>;
type Candidate = {
  id: string; full_name: string; primary_title: string; location?: string;
  active: boolean; skills: string[]; created_at: string;
  applications_count: number; latest_status: string | null;
};
type Recruiter = {
  id: string; name: string; email: string; created_at: string;
  candidates_count: number; applications_count: number;
  interviews_count: number; offers_count: number;
};

const STAGES = [
  { key: 'ready',     label: 'Ready',     color: 'bg-surface-200', text: 'text-surface-600' },
  { key: 'applied',   label: 'Applied',   color: 'bg-blue-100',    text: 'text-blue-700'   },
  { key: 'screening', label: 'Screening', color: 'bg-yellow-100',  text: 'text-yellow-700' },
  { key: 'interview', label: 'Interview', color: 'bg-purple-100',  text: 'text-purple-700' },
  { key: 'offer',     label: 'Offer',     color: 'bg-green-100',   text: 'text-green-700'  },
  { key: 'rejected',  label: 'Rejected',  color: 'bg-red-50',      text: 'text-red-500'    },
] as const;

function MiniBar({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1.5 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-sm bg-brand-500 opacity-80"
            style={{ height: `${Math.max((d.count / max) * 52, d.count > 0 ? 6 : 2)}px` }}
          />
          <span className="text-[10px] text-surface-400">{d.date}</span>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ label, value, icon, href }: {
  label: string; value: number; icon: React.ReactNode; href?: string;
}) {
  const inner = (
    <div className="card p-5 flex items-start justify-between group hover:shadow-md transition-shadow cursor-pointer">
      <div>
        <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">{label}</p>
        <p className="text-3xl font-bold text-surface-900 mt-1 tabular-nums">{value.toLocaleString()}</p>
      </div>
      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 group-hover:bg-brand-100 transition-colors">
        {icon}
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const colors = [
    'bg-blue-600/20 text-blue-300', 'bg-purple-600/20 text-purple-300',
    'bg-green-600/20 text-green-300', 'bg-amber-600/20 text-amber-300',
    'bg-rose-600/20 text-rose-300', 'bg-teal-600/20 text-teal-300',
  ];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div className={cn('rounded-full flex items-center justify-center font-bold shrink-0', sz, color)}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

export default function AdminDashboardClient({
  stats, pipeline, candidates, recruiters, recentApps, topMatches, activityChart,
}: {
  stats: Stats;
  pipeline: Pipeline;
  candidates: Candidate[];
  recruiters: Recruiter[];
  recentApps: any[];
  topMatches: any[];
  activityChart: { date: string; count: number }[];
}) {
  const [tab, setTab] = useState<'candidates' | 'recruiters'>('candidates');
  const [candSearch, setCandSearch] = useState('');
  const [recruiterSearch, setRecruiterSearch] = useState('');
  const [matching, setMatching] = useState(false);
  const [matchMsg, setMatchMsg] = useState<string | null>(null);
  const router = useRouter();

  const runMatching = async () => {
    setMatching(true);
    setMatchMsg(null);
    try {
      const res = await fetch('/api/matches', { method: 'GET' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Matching failed');
      setMatchMsg(`✅ ${d.total_matches_upserted ?? 0} matches across ${d.candidates_processed ?? 0} candidates`);
    } catch (err: any) {
      setMatchMsg(`❌ ${err.message ?? 'Matching failed'}`);
    }
    setMatching(false);
    router.refresh();
  };

  const filteredCandidates = candidates.filter(c =>
    c.full_name?.toLowerCase().includes(candSearch.toLowerCase()) ||
    c.primary_title?.toLowerCase().includes(candSearch.toLowerCase()) ||
    c.location?.toLowerCase().includes(candSearch.toLowerCase())
  );

  const filteredRecruiters = recruiters.filter(r =>
    r.name?.toLowerCase().includes(recruiterSearch.toLowerCase()) ||
    r.email?.toLowerCase().includes(recruiterSearch.toLowerCase())
  );

  const totalPipeline = Object.values(pipeline).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Operations Dashboard</h1>
          <p className="text-sm text-surface-500 mt-1">Pipeline · Candidates · Recruiters · Matches</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/dashboard/admin/scraping" className="btn-secondary text-sm flex items-center gap-1.5">
            <Briefcase size={14} /> Scrape Jobs
          </Link>
          <button onClick={runMatching} disabled={matching} className="btn-primary text-sm flex items-center gap-1.5">
            {matching ? <><Spinner size={12} /> Matching...</> : <><Zap size={14} /> Run Matching</>}
          </button>
        </div>
      </div>

      {matchMsg && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
          {matchMsg}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Candidates"   value={stats.candidates}   icon={<Users size={18} />}         href="/dashboard/admin/candidates" />
        <KpiCard label="Jobs"         value={stats.jobs}         icon={<Briefcase size={18} />}      href="/dashboard/admin/jobs"       />
        <KpiCard label="Matches"      value={stats.matches}      icon={<TrendingUp size={18} />}                                        />
        <KpiCard label="Applications" value={stats.applications} icon={<ClipboardList size={18} />}                                    />
        <KpiCard label="Resumes"      value={stats.resumes}      icon={<FileText size={18} />}                                         />
        <KpiCard label="Recruiters"   value={stats.recruiters}   icon={<UserCheck size={18} />}      href="/dashboard/admin/users"      />
      </div>

      {/* Pipeline + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-surface-900">Application Pipeline</h2>
              <p className="text-xs text-surface-500 mt-0.5">{totalPipeline} total applications</p>
            </div>
          </div>
          <div className="space-y-2">
            {STAGES.map(s => {
              const count = pipeline[s.key];
              const pct = totalPipeline ? Math.round((count / totalPipeline) * 100) : 0;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-surface-600 w-16 shrink-0">{s.label}</span>
                  <div className="flex-1 h-6 bg-surface-100 rounded-md overflow-hidden">
                    <div
                      className={cn('h-full rounded-md flex items-center px-2', s.color)}
                      style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                    >
                      {pct >= 8 && <span className={cn('text-xs font-semibold', s.text)}>{pct}%</span>}
                    </div>
                  </div>
                  <span className={cn('text-sm font-bold tabular-nums w-8 text-right', s.text)}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-surface-900">7-Day Activity</h2>
            <p className="text-xs text-surface-500 mt-0.5">Applications created</p>
          </div>
          <MiniBar data={activityChart} />
          <div className="mt-4 pt-4 border-t border-surface-100 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-surface-500">Today</p>
              <p className="text-xl font-bold text-surface-900 tabular-nums">
                {activityChart[activityChart.length - 1]?.count || 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-surface-500">This week</p>
              <p className="text-xl font-bold text-surface-900 tabular-nums">
                {activityChart.reduce((a, d) => a + d.count, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Browse panel — Candidates / Recruiters */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-surface-200">
          {([
            { key: 'candidates', label: 'Candidates', count: stats.candidates, icon: <Users size={14} /> },
            { key: 'recruiters', label: 'Recruiters',  count: stats.recruiters,  icon: <UserCheck size={14} /> },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-surface-500 hover:text-surface-700'
              )}
            >
              {t.icon} {t.label}
              <span className={cn('ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold',
                tab === t.key ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-surface-500')}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Candidates tab */}
        {tab === 'candidates' && (
          <div>
            <div className="p-4 border-b border-surface-100 flex items-center gap-3">
              <div className="relative flex-1 w-full sm:max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input className="input text-sm pl-8" placeholder="Search by name, title, location..."
                  value={candSearch} onChange={e => setCandSearch(e.target.value)} />
              </div>
              <Link href="/dashboard/admin/candidates" className="btn-ghost text-xs flex items-center gap-1 shrink-0">
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {filteredCandidates.length === 0 ? (
              <div className="py-12 text-center text-sm text-surface-500">
                {candSearch ? 'No candidates match your search' : 'No candidates yet'}
              </div>
            ) : (
              <div className="divide-y divide-surface-50">
                {filteredCandidates.slice(0, 15).map(c => (
                  <Link key={c.id} href={`/dashboard/admin/candidates/${c.id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-surface-50 transition-colors group">
                    <Avatar name={c.full_name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-surface-900 truncate">{c.full_name}</p>
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0',
                          c.active ? 'bg-green-100 text-green-700' : 'bg-surface-100 text-surface-500')}>
                          {c.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-surface-500 truncate">{c.primary_title}</span>
                        {c.location && (
                          <span className="text-xs text-surface-400 flex items-center gap-1 shrink-0">
                            <MapPin size={10} />{c.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hidden md:flex gap-1 flex-wrap max-w-[180px]">
                      {(c.skills as string[])?.slice(0, 3).map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-surface-100 text-surface-600 rounded text-[11px]">{s}</span>
                      ))}
                      {(c.skills as string[])?.length > 3 && (
                        <span className="text-[11px] text-surface-400 px-1">+{(c.skills as string[]).length - 3}</span>
                      )}
                    </div>
                    <div className="shrink-0 text-right min-w-[70px]">
                      <p className="text-xs font-medium text-surface-600 mb-1">
                        {c.applications_count} app{c.applications_count !== 1 ? 's' : ''}
                      </p>
                      {c.latest_status
                        ? <StatusBadge status={c.latest_status} />
                        : <span className="text-xs text-surface-300">—</span>}
                    </div>
                    <ChevronRight size={14} className="text-surface-300 group-hover:text-surface-500 shrink-0" />
                  </Link>
                ))}
              </div>
            )}

            {filteredCandidates.length > 15 && (
              <div className="px-5 py-3 border-t border-surface-100 text-center">
                <Link href="/dashboard/admin/candidates" className="text-xs text-brand-600 hover:underline font-medium">
                  View all {filteredCandidates.length} candidates →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Recruiters tab */}
        {tab === 'recruiters' && (
          <div>
            <div className="p-4 border-b border-surface-100 flex items-center gap-3">
              <div className="relative flex-1 w-full sm:max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input className="input text-sm pl-8" placeholder="Search recruiters..."
                  value={recruiterSearch} onChange={e => setRecruiterSearch(e.target.value)} />
              </div>
              <Link href="/dashboard/admin/users" className="btn-ghost text-xs flex items-center gap-1 shrink-0">
                Manage roles <ArrowRight size={12} />
              </Link>
            </div>

            {filteredRecruiters.length === 0 ? (
              <div className="py-12 text-center text-sm text-surface-500">
                {recruiterSearch ? 'No recruiters match your search' : (
                  <div className="space-y-2">
                    <p>No recruiters yet.</p>
                    <Link href="/dashboard/admin/users" className="text-brand-600 hover:underline text-xs inline-block">
                      Go to Users → assign recruiter roles →
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-surface-50">
                {filteredRecruiters.map(r => {
                  const convRate = r.applications_count > 0
                    ? Math.round((r.offers_count / r.applications_count) * 100) : 0;
                  return (
                    <div key={r.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-50">
                      <Avatar name={r.name || r.email} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-surface-900">{r.name || '(no name)'}</p>
                        <p className="text-xs text-surface-500">{r.email}</p>
                        <p className="text-xs text-surface-400 mt-0.5">Joined {formatRelative(r.created_at)}</p>
                      </div>
                      <div className="hidden sm:grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                        {[
                          { label: 'Candidates', val: r.candidates_count,   color: 'text-surface-900' },
                          { label: 'Apps',       val: r.applications_count, color: 'text-blue-700'    },
                          { label: 'Interviews', val: r.interviews_count,   color: 'text-purple-700'  },
                          { label: 'Offers',     val: r.offers_count,       color: 'text-green-700'   },
                        ].map(m => (
                          <div key={m.label}>
                            <p className={cn('text-lg font-bold tabular-nums', m.color)}>{m.val}</p>
                            <p className="text-[10px] text-surface-400 mt-0.5">{m.label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn('text-sm font-bold',
                          convRate >= 20 ? 'text-green-600' : convRate >= 10 ? 'text-amber-600' : 'text-surface-400')}>
                          {convRate}%
                        </p>
                        <p className="text-[10px] text-surface-400">offer rate</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom: Top Matches + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-surface-900">Top Matches</h2>
              <p className="text-xs text-surface-500 mt-0.5">Highest AI fit scores</p>
            </div>
          </div>
          {topMatches.length === 0 ? (
            <div className="py-10 text-center text-sm text-surface-500">
              No matches yet — click Run Matching above
            </div>
          ) : (
            <div className="divide-y divide-surface-50">
              {topMatches.map((m, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ring-1',
                    (() => { const c = getScoreBadgeClasses(m.fit_score); return `${c.bg} ${c.text}`; })())}>
                    {m.fit_score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 truncate">{m.candidate?.full_name}</p>
                    <p className="text-xs text-surface-500 truncate">{m.job?.title} · {m.job?.company}</p>
                  </div>
                  {m.fit_score >= 82 && <Star size={12} className="text-amber-400 shrink-0" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200">
            <h2 className="text-base font-semibold text-surface-900">Recent Activity</h2>
            <p className="text-xs text-surface-500 mt-0.5">Latest application updates</p>
          </div>
          {recentApps.length === 0 ? (
            <div className="py-10 text-center text-sm text-surface-500">No activity yet</div>
          ) : (
            <div className="divide-y divide-surface-50">
              {recentApps.map((app, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <Avatar name={app.candidate?.full_name || '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 truncate">{app.candidate?.full_name}</p>
                    <p className="text-xs text-surface-500 truncate">{app.job?.title} · {app.job?.company}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <StatusBadge status={app.status} />
                    <span className="text-[10px] text-surface-400">{formatRelative(app.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}