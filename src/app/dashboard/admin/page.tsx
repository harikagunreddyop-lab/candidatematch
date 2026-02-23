'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { Spinner, StatusBadge } from '@/components/ui';
import {
  Users,
  Briefcase,
  FileText,
  ClipboardList,
  TrendingUp,
  RefreshCw,
  ChevronRight,
  Link2,
  Zap,
  Activity,
  Sparkles,
} from 'lucide-react';
import { formatRelative, cn } from '@/utils/helpers';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const STAT_CONFIG = [
  {
    key: 'candidates',
    label: 'Candidates',
    href: '/dashboard/admin/candidates',
    icon: Users,
    gradient: 'from-emerald-500 to-teal-600',
    lightBg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'jobs',
    label: 'Jobs',
    href: '/dashboard/admin/jobs',
    icon: Briefcase,
    gradient: 'from-violet-500 to-purple-600',
    lightBg: 'bg-violet-500/10 dark:bg-violet-500/15',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    key: 'applications',
    label: 'Applications',
    href: '/dashboard/admin/applications',
    icon: ClipboardList,
    gradient: 'from-blue-500 to-indigo-600',
    lightBg: 'bg-blue-500/10 dark:bg-blue-500/15',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    key: 'resumes',
    label: 'Resumes generated',
    href: '/dashboard/admin/candidates',
    icon: FileText,
    gradient: 'from-amber-500 to-orange-600',
    lightBg: 'bg-amber-500/10 dark:bg-amber-500/15',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    key: 'recruiters',
    label: 'Recruiters',
    href: '/dashboard/admin/users',
    icon: TrendingUp,
    gradient: 'from-rose-500 to-pink-600',
    lightBg: 'bg-rose-500/10 dark:bg-rose-500/15',
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
  {
    key: 'assignments',
    label: 'Assignments',
    href: '/dashboard/admin/assignments',
    icon: Link2,
    gradient: 'from-cyan-500 to-sky-600',
    lightBg: 'bg-cyan-500/10 dark:bg-cyan-500/15',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
  },
];

function StatCard({
  label,
  value,
  href,
  lightBg,
  iconColor,
  gradient,
  Icon,
}: {
  label: string;
  value: number | string;
  href: string;
  gradient: string;
  lightBg: string;
  iconColor: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="group relative rounded-2xl bg-surface-800 border border-surface-700/60 p-5 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center gap-3 overflow-hidden"
    >
      <div className={cn('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br', gradient)} style={{ opacity: 0 }} />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.08] transition-opacity duration-300 bg-gradient-to-br from-white to-transparent" />
      <div className={cn('relative w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110', lightBg)}>
        <Icon size={22} className={iconColor} />
      </div>
      <div className="relative">
        <p className="text-3xl font-extrabold text-surface-100 tabular-nums font-display tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-widest mt-1">
          {label}
        </p>
      </div>
    </Link>
  );
}

function PanelCard({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  icon,
  iconBg,
  children,
  emptyMessage,
  isEmpty,
}: {
  title: string;
  subtitle?: string;
  viewAllHref: string;
  viewAllLabel: string;
  icon: React.ReactNode;
  iconBg: string;
  children: React.ReactNode;
  emptyMessage: React.ReactNode;
  isEmpty: boolean;
}) {
  return (
    <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-100 dark:border-surface-700 flex items-center justify-between bg-surface-50/50 dark:bg-surface-700/30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className={cn('w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
            {icon}
          </span>
          <div>
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <Link
          href={viewAllHref}
          className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1 transition-colors"
        >
          {viewAllLabel}
          <ChevronRight size={14} />
        </Link>
      </div>
      {isEmpty ? (
        <div className="px-4 sm:px-6 py-8 sm:py-10 text-center">
          <p className="text-sm text-surface-500 dark:text-surface-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-100 dark:divide-surface-700">{children}</div>
      )}
    </div>
  );
}

function AvatarInitial({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ring-1 ring-surface-200/50 dark:ring-surface-600/50',
        'bg-gradient-to-br from-brand-500/20 to-brand-600/20 dark:from-brand-500/30 dark:to-brand-600/30',
        'text-brand-700 dark:text-brand-300',
        className
      )}
    >
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

export default function AdminDashboard() {
  const supabase = createClient();
  const [stats, setStats] = useState({
    candidates: 0,
    jobs: 0,
    resumes: 0,
    applications: 0,
    recruiters: 0,
    assignments: 0,
  });
  const [recentApps, setRecentApps] = useState<any[]>([]);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [recentCandidates, setRecentCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);

    const [
      candidates,
      jobs,
      resumes,
      applications,
      recruiters,
      assignments,
      apps,
      jobsList,
      candList,
    ] = await Promise.all([
      supabase.from('candidates').select('id', { count: 'exact', head: true }),
      supabase.from('jobs').select('id', { count: 'exact', head: true }),
      supabase
        .from('resume_versions')
        .select('id', { count: 'exact', head: true })
        .eq('generation_status', 'completed'),
      supabase.from('applications').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'recruiter'),
      supabase
        .from('recruiter_candidate_assignments')
        .select('recruiter_id', { count: 'exact', head: true }),
      supabase
        .from('applications')
        .select('*, job:jobs(title, company), candidate:candidates(full_name)')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase.from('jobs').select('*').order('scraped_at', { ascending: false }).limit(6),
      supabase
        .from('candidates')
        .select('id, full_name, primary_title, email, created_at, active')
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

    setStats({
      candidates: candidates.count || 0,
      jobs: jobs.count || 0,
      resumes: resumes.count || 0,
      applications: applications.count || 0,
      recruiters: recruiters.count || 0,
      assignments: assignments.count || 0,
    });
    setRecentApps(apps.data || []);
    setRecentJobs(jobsList.data || []);
    setRecentCandidates(candList.data || []);
    setLastRefreshed(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Spinner size={32} />
        <p className="text-sm text-surface-500 dark:text-surface-400 font-medium">
          Loading dashboard…
        </p>
      </div>
    );
  }

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 -top-8 -left-8 -right-8 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(120,80,220,0.07),transparent)] dark:bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(120,80,220,0.12),transparent)]" aria-hidden />
      <div className="relative space-y-8">
      {/* Hero — elite gradient like candidate */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface-900 via-surface-800 to-brand-900/90 px-4 sm:px-6 py-6 sm:py-8 lg:py-10 text-white shadow-xl border border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,80,200,0.2),transparent)]" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-brand-500/10 to-transparent" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex-1">
            <p className="text-surface-300/90 text-xs font-semibold uppercase tracking-[0.2em] mb-2">{dateStr}</p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-display tracking-tight text-white drop-shadow-sm">
              {getGreeting()}
            </h1>
            <p className="text-surface-300 mt-1.5 text-sm sm:text-base flex items-center gap-2">
              <Activity size={16} className="text-surface-400 shrink-0" />
              Admin control center · Pipeline overview
              {lastRefreshed && (
                <span className="text-surface-400 text-xs font-medium">
                  · Live {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/10">
                <span className="text-xs font-bold tabular-nums text-white/90">{stats.candidates}</span>
                <span className="text-xs text-white/80">candidates</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/10">
                <span className="text-xs font-bold tabular-nums text-white/90">{stats.applications}</span>
                <span className="text-xs text-white/80">applications</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => load()}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
            <Link
              href="/dashboard/admin/scraping"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-surface-900 font-semibold text-sm shadow-lg hover:bg-surface-50 hover:shadow-xl transition-all"
            >
              <Zap size={18} />
              Scrape jobs
            </Link>
            <Link
              href="/dashboard/admin/reports"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium"
            >
              Reports
            </Link>
          </div>
        </div>
      </div>

      {/* Key metrics — stat cards elite style */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {STAT_CONFIG.map((s) => (
          <StatCard
            key={s.key}
            label={s.label}
            value={(stats as Record<string, number>)[s.key] ?? 0}
            href={s.href}
            gradient={s.gradient}
            lightBg={s.lightBg}
            iconColor={s.iconColor}
            Icon={s.icon as React.ComponentType<{ size?: number; className?: string }>}
          />
        ))}
      </div>

      {/* Activity panels */}
      <div>
        <h2 className="text-xs font-bold text-surface-500 dark:text-surface-400 uppercase tracking-widest mb-4">
          Activity
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <PanelCard
            title="Recent applications"
            subtitle="Latest candidate applications"
            viewAllHref="/dashboard/admin/applications"
            viewAllLabel="View all"
            iconBg="bg-blue-500/10 dark:bg-blue-500/20"
            icon={<ClipboardList size={18} className="text-blue-600 dark:text-blue-400" />}
            emptyMessage="No applications yet"
            isEmpty={recentApps.length === 0}
          >
            {recentApps.map((app) => (
              <div
                key={app.id}
                className="px-4 sm:px-6 py-3 sm:py-4 hover:bg-surface-50/80 dark:hover:bg-surface-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <AvatarInitial name={(app.candidate as any)?.full_name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
                      {(app.candidate as any)?.full_name}
                    </p>
                    <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
                      {app.job?.title} at {app.job?.company}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge status={app.status} />
                    <p className="text-[10px] text-surface-400 dark:text-surface-500 mt-1">
                      {formatRelative(app.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </PanelCard>

          <PanelCard
            title="Latest jobs"
            subtitle="Most recently ingested"
            viewAllHref="/dashboard/admin/jobs"
            viewAllLabel="View all"
            iconBg="bg-violet-500/10 dark:bg-violet-500/20"
            icon={<Briefcase size={18} className="text-violet-600 dark:text-violet-400" />}
            emptyMessage={
              <>
                No jobs yet.{' '}
                <Link href="/dashboard/admin/scraping" className="text-brand-600 dark:text-brand-400 hover:underline font-medium">
                  Run a scrape
                </Link>
              </>
            }
            isEmpty={recentJobs.length === 0}
          >
            {recentJobs.map((job) => (
              <Link
                key={job.id}
                href="/dashboard/admin/jobs"
                className="px-4 sm:px-6 py-3 sm:py-4 block hover:bg-surface-50/80 dark:hover:bg-surface-700/30 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
                    <Briefcase size={18} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {job.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-surface-500 dark:text-surface-400">{job.company}</span>
                      {job.source && (
                        <span className="px-1.5 py-0.5 rounded-md bg-surface-100 dark:bg-surface-700 text-[10px] font-medium text-surface-600 dark:text-surface-300">
                          {job.source}
                        </span>
                      )}
                      <span className="text-[10px] text-surface-400 dark:text-surface-500">
                        {formatRelative(job.scraped_at || job.created_at)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-surface-300 dark:text-surface-500 group-hover:text-brand-500 shrink-0" />
                </div>
              </Link>
            ))}
          </PanelCard>

          <PanelCard
            title="New candidates"
            subtitle="Recently added to pipeline"
            viewAllHref="/dashboard/admin/candidates"
            viewAllLabel="View all"
            iconBg="bg-emerald-500/10 dark:bg-emerald-500/20"
            icon={<Users size={18} className="text-emerald-600 dark:text-emerald-400" />}
            emptyMessage="No candidates yet"
            isEmpty={recentCandidates.length === 0}
          >
            {recentCandidates.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/admin/candidates/${c.id}`}
                className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 hover:bg-surface-50/80 dark:hover:bg-surface-700/30 transition-colors group"
              >
                <AvatarInitial name={c.full_name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {c.full_name}
                    </p>
                    <span
                      className={cn(
                        'shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold',
                        c.active
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-surface-200 dark:bg-surface-600 text-surface-600 dark:text-surface-400'
                      )}
                    >
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-surface-500 dark:text-surface-400 truncate mt-0.5">
                    {c.primary_title || 'No title'} · {formatRelative(c.created_at)}
                  </p>
                </div>
                <ChevronRight size={16} className="text-surface-300 dark:text-surface-500 group-hover:text-brand-500 shrink-0" />
              </Link>
            ))}
          </PanelCard>
        </div>
      </div>

      {/* Quick actions — elite strip like candidate recommended step */}
      <div className="rounded-2xl border border-brand-200 dark:border-brand-500/40 bg-gradient-to-r from-brand-50 to-white dark:from-brand-500/10 dark:to-surface-800 px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 dark:bg-brand-500/30 flex items-center justify-center shrink-0">
            <Sparkles size={20} className="text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-700 dark:text-brand-300 uppercase tracking-wide">Quick actions</p>
            <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 hidden sm:block">Invite users, assign recruiters, view pipeline & reports</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <Link href="/dashboard/admin/users" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 text-sm font-medium text-surface-700 dark:text-surface-200 hover:border-brand-400 dark:hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors shadow-sm">
            Invite user
          </Link>
          <Link href="/dashboard/admin/assignments" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 text-sm font-medium text-surface-700 dark:text-surface-200 hover:border-brand-400 dark:hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors shadow-sm">
            Assign recruiters
          </Link>
          <Link href="/dashboard/admin/pipeline" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 text-sm font-medium text-surface-700 dark:text-surface-200 hover:border-brand-400 dark:hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors shadow-sm">
            Pipeline
          </Link>
          <Link href="/dashboard/admin/reports" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-lg shadow-brand-500/25 transition-all">
            Reports
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
}
