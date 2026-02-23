'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { Spinner, StatusBadge } from '@/components/ui';
import {
  Users, Briefcase, FileText, ClipboardList, TrendingUp,
  RefreshCw, ChevronRight, Link2, AlertTriangle, UserCheck,
} from 'lucide-react';
import { formatRelative, cn } from '@/utils/helpers';

function StatCard({ label, value, icon, href, color }: {
  label: string; value: number | string; icon: React.ReactNode; href: string; color: string;
}) {
  return (
    <Link href={href} className="group rounded-2xl bg-surface-800 border border-surface-700/60 p-5 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center gap-3">
      <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110', color)}>
        {icon}
      </div>
      <div>
        <p className="text-3xl font-extrabold text-surface-100 tabular-nums font-display tracking-tight">{value}</p>
        <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-widest mt-1">{label}</p>
      </div>
    </Link>
  );
}

export default function AdminDashboard() {
  const supabase = createClient();
  const [stats, setStats] = useState({
    candidates: 0, jobs: 0, resumes: 0, applications: 0, recruiters: 0, assignments: 0,
  });
  const [stuckCount, setStuckCount] = useState(0);
  const [unassignedCandidates, setUnassignedCandidates] = useState<any[]>([]);
  const [recentApps, setRecentApps] = useState<any[]>([]);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [recentCandidates, setRecentCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);

    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

    const [
      candidates, jobs, resumes, applications, recruiters, assignments,
      apps, jobsList, candList, stuckRes, unassignedRes,
    ] = await Promise.all([
      supabase.from('candidates').select('id', { count: 'exact', head: true }),
      supabase.from('jobs').select('id', { count: 'exact', head: true }),
      supabase.from('resume_versions').select('id', { count: 'exact', head: true }).eq('generation_status', 'completed'),
      supabase.from('applications').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'recruiter'),
      supabase.from('recruiter_candidate_assignments').select('recruiter_id', { count: 'exact', head: true }),
      supabase.from('applications')
        .select('*, job:jobs(title, company), candidate:candidates(full_name)')
        .order('created_at', { ascending: false }).limit(5),
      supabase.from('jobs').select('*')
        .order('scraped_at', { ascending: false }).limit(5),
      supabase.from('candidates').select('id, full_name, primary_title, email, created_at, active')
        .order('created_at', { ascending: false }).limit(5),
      // Stuck candidates: in an active status but not updated in 14+ days
      supabase.from('applications')
        .select('id', { count: 'exact', head: true })
        .in('status', ['applied', 'screening', 'interview'])
        .lt('updated_at', fourteenDaysAgo),
      // All candidates — we filter unassigned client-side (invite-only flow)
      supabase.from('candidates')
        .select('id, full_name, primary_title, email, created_at, recruiter_candidate_assignments(candidate_id)')
        .order('created_at', { ascending: false }),
    ]);

    setStats({
      candidates: candidates.count || 0,
      jobs: jobs.count || 0,
      resumes: resumes.count || 0,
      applications: applications.count || 0,
      recruiters: recruiters.count || 0,
      assignments: assignments.count || 0,
    });
    setStuckCount(stuckRes.count || 0);
    const unassigned = (unassignedRes.data || []).filter(
      (c: any) => !c.recruiter_candidate_assignments || c.recruiter_candidate_assignments.length === 0
    );
    setUnassignedCandidates(unassigned);
    setRecentApps(apps.data || []);
    setRecentJobs(jobsList.data || []);
    setRecentCandidates(candList.data || []);
    setLastRefreshed(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Dashboard</h1>
          <p className="text-sm text-surface-500 mt-1">
            Overview of your recruitment pipeline
            {lastRefreshed && (
              <span className="text-surface-400">
                {' '}· updated {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <button onClick={() => load()} className="btn-ghost text-sm flex items-center gap-1.5">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Stuck Candidates Alert Banner ── */}
      {stuckCount > 0 && (
        <Link
          href="/dashboard/admin/reports"
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">
              {stuckCount} candidate{stuckCount > 1 ? 's' : ''} stuck for 14+ days
            </span>
            {' '}— needs recruiter attention
          </p>
          <ChevronRight size={14} className="text-amber-500 ml-auto shrink-0" />
        </Link>
      )}

      {/* ── Unassigned Candidates Banner ── */}
      {unassignedCandidates.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand-200">
            <div className="flex items-center gap-2">
              <UserCheck size={15} className="text-brand-600" />
              <p className="text-sm font-semibold text-brand-800">
                {unassignedCandidates.length} candidate{unassignedCandidates.length > 1 ? 's' : ''} waiting for recruiter assignment
              </p>
            </div>
            <Link href="/dashboard/admin/candidates"
              className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              View all <ChevronRight size={12}/>
            </Link>
          </div>
          <div className="divide-y divide-brand-100">
            {unassignedCandidates.map(c => (
              <Link key={c.id} href={`/dashboard/admin/candidates/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-brand-100 transition-colors group">
                <div className="w-8 h-8 rounded-full bg-brand-200 flex items-center justify-center text-brand-700 font-bold text-xs shrink-0">
                  {c.full_name?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-surface-900">{c.full_name}</p>
                  <p className="text-xs text-surface-500">{c.primary_title || 'No title yet'} · invited {formatRelative(c.created_at)}</p>
                </div>
                <span className="text-xs text-brand-600 font-medium group-hover:underline shrink-0">Assign recruiter →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Candidates" value={stats.candidates}
          icon={<Users size={18} className="text-brand-600" />}
          href="/dashboard/admin/candidates" color="bg-brand-50" />
        <StatCard label="Jobs" value={stats.jobs}
          icon={<Briefcase size={18} className="text-purple-600" />}
          href="/dashboard/admin/jobs" color="bg-purple-50" />
        <StatCard label="Applications" value={stats.applications}
          icon={<ClipboardList size={18} className="text-green-600" />}
          href="/dashboard/admin/candidates" color="bg-green-50" />
        <StatCard label="Resumes Generated" value={stats.resumes}
          icon={<FileText size={18} className="text-amber-600" />}
          href="/dashboard/admin/candidates" color="bg-amber-50" />
        <StatCard label="Recruiters" value={stats.recruiters}
          icon={<TrendingUp size={18} className="text-indigo-600" />}
          href="/dashboard/admin/users" color="bg-indigo-50" />
        <StatCard label="Assignments" value={stats.assignments}
          icon={<Link2 size={18} className="text-pink-600" />}
          href="/dashboard/admin/assignments" color="bg-pink-50" />
      </div>

      {/* ── Recent Activity Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Applications */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="text-sm font-semibold text-surface-800">Recent Applications</h3>
          </div>
          {recentApps.length === 0 ? (
            <p className="p-5 text-sm text-surface-400">No applications yet</p>
          ) : (
            <div className="divide-y divide-surface-100">
              {recentApps.map(app => (
                <div key={app.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-surface-800 truncate">
                    {(app.candidate as any)?.full_name}
                  </p>
                  <p className="text-xs text-surface-500 truncate">
                    {app.job?.title} at {app.job?.company}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={app.status} />
                    <span className="text-[10px] text-surface-400">{formatRelative(app.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Latest Jobs */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-800">Latest Jobs</h3>
            <Link href="/dashboard/admin/jobs"
              className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {recentJobs.length === 0 ? (
            <p className="p-5 text-sm text-surface-400">
              No jobs yet.{' '}
              <Link href="/dashboard/admin/scraping" className="text-brand-600 hover:underline">
                Run a scrape
              </Link>
            </p>
          ) : (
            <div className="divide-y divide-surface-100">
              {recentJobs.map(job => (
                <div key={job.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-surface-800 truncate">{job.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-surface-500">
                    <span>{job.company}</span>
                    {job.source && (
                      <span className="badge-neutral text-[10px]">{job.source}</span>
                    )}
                    <span className="text-surface-400">
                      {formatRelative(job.scraped_at || job.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New Candidates */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-800">New Candidates</h3>
            <Link href="/dashboard/admin/candidates"
              className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {recentCandidates.length === 0 ? (
            <p className="p-5 text-sm text-surface-400">No candidates yet</p>
          ) : (
            <div className="divide-y divide-surface-100">
              {recentCandidates.map(c => (
                <Link key={c.id} href={`/dashboard/admin/candidates/${c.id}`}
                  className="px-5 py-3 block hover:bg-surface-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs shrink-0">
                      {c.full_name?.[0] || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-surface-800 truncate">{c.full_name}</p>
                      <p className="text-xs text-surface-500 truncate">
                        {c.primary_title} · {formatRelative(c.created_at)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}