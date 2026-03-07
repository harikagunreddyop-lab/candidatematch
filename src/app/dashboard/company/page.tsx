'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { Users, Briefcase, TrendingUp, UserPlus, BarChart2, ChevronRight, Building2, Clock, Target, Zap } from 'lucide-react';
import { cn, formatRelative } from '@/utils/helpers';
import type { Company, CompanyAnalytics } from '@/types';

export default function CompanyDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from('profile_roles').select('name, company_id, effective_role').eq('id', session.user.id).single();

      if (!profile) { setLoading(false); return; }

      if (!profile.company_id) {
        setData({ profile, company: null, analytics: null, team: [], jobs: [], activity: [] });
        setLoading(false);
        return;
      }

      const [companyRes, analyticsRes, teamRes, jobsRes, activityRes] = await Promise.all([
        supabase.from('companies').select('*').eq('id', profile.company_id).single(),
        supabase.from('company_analytics').select('*').eq('company_id', profile.company_id).single(),
        supabase.from('profiles').select('id, name, email, effective_role, last_active_at')
          .eq('company_id', profile.company_id).in('effective_role', ['company_admin', 'recruiter']),
        supabase.from('jobs').select('id, title, is_active, applications_count, created_at')
          .eq('company_id', profile.company_id).order('created_at', { ascending: false }).limit(5),
        supabase.from('candidate_activity').select('*, candidate:candidates(full_name)')
          .eq('company_id', profile.company_id).order('created_at', { ascending: false }).limit(8),
      ]);

      setData({ profile, company: companyRes.data, analytics: analyticsRes.data,
        team: teamRes.data || [], jobs: jobsRes.data || [], activity: activityRes.data || [] });
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
    </div>
  );
  if (!data) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <Building2 className="w-12 h-12 text-surface-500 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-white mb-2">No company linked</h2>
      <p className="text-surface-400">Contact your platform administrator to link your account to a company.</p>
    </div>
  );

  const { profile: profileData, company, analytics, team, jobs, activity } = data as {
    profile: { effective_role?: string }; company: Company | null; analytics: CompanyAnalytics | null;
    team: any[]; jobs: any[]; activity: any[];
  };

  if (!company) {
    const isPlatformAdmin = profileData?.effective_role === 'platform_admin';
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Building2 className="w-12 h-12 text-surface-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">
          {isPlatformAdmin ? 'No company selected' : 'No company linked'}
        </h2>
        <p className="text-surface-400 mb-4">
          {isPlatformAdmin
            ? 'You are viewing as platform admin. To see a company dashboard, open a company from Admin → Companies.'
            : 'Contact your platform administrator to link your account to a company.'}
        </p>
        {isPlatformAdmin && (
          <Link
            href="/dashboard/admin/companies"
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Open Companies
          </Link>
        )}
      </div>
    );
  }

  const kpis = [
    { label: 'Jobs Posted',   value: analytics?.total_jobs_posted   ?? 0, icon: Briefcase,  color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { label: 'Applications',  value: analytics?.total_applications  ?? 0, icon: Users,       color: 'text-blue-400',   bg: 'bg-blue-500/10' },
    { label: 'Interviews',    value: analytics?.total_interviews    ?? 0, icon: TrendingUp,  color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
    { label: 'Hires',         value: analytics?.total_hires         ?? 0, icon: Target,      color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {company?.logo_url
              ? <img src={company.logo_url} alt={company.name} className="w-9 h-9 rounded-xl object-cover" />
              : <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center"><Building2 className="w-5 h-5 text-violet-400" /></div>
            }
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{company?.name}</h1>
          </div>
          <p className="text-surface-500 text-sm capitalize">
            {company?.subscription_plan} plan · {company?.subscription_status} · {team.length} team member{team.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/dashboard/company/team/invite"
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
            <UserPlus className="w-4 h-4" />Invite Recruiter
          </Link>
          <Link href="/dashboard/company/jobs"
            className="flex items-center gap-2 px-4 py-2 bg-surface-100 dark:bg-surface-700 text-surface-700 dark:text-surface-200 rounded-xl text-sm font-semibold transition-colors">
            <Briefcase className="w-4 h-4" />Post Job
          </Link>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="rounded-2xl bg-surface-800 border border-surface-700/60 p-5 shadow-lg">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', k.bg)}>
              <k.icon className={cn('w-5 h-5', k.color)} />
            </div>
            <div className="text-2xl font-bold text-white">{k.value}</div>
            <div className="text-xs text-surface-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline funnel if we have data */}
      {analytics && analytics.total_applications > 0 && (
        <div className="rounded-2xl bg-surface-800 border border-surface-700/60 p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-violet-400" />Hiring Funnel
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Applied',    value: analytics.total_applications,   color: 'bg-blue-500' },
              { label: 'Interviews', value: analytics.total_interviews,      color: 'bg-violet-500' },
              { label: 'Offers',     value: analytics.total_offers,          color: 'bg-amber-500' },
              { label: 'Hires',      value: analytics.total_hires,           color: 'bg-emerald-500' },
            ].map((stage, i, arr) => (
              <div key={stage.label} className="flex items-center gap-2">
                <div className="text-center">
                  <div className={cn('rounded-lg px-4 py-2 text-white font-semibold text-sm', stage.color)}>{stage.value}</div>
                  <div className="text-xs text-surface-500 mt-1">{stage.label}</div>
                </div>
                {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-surface-600 mt-[-20px]" />}
              </div>
            ))}
            {analytics.avg_time_to_hire_days != null && (
              <div className="ml-auto flex items-center gap-2 text-surface-400 text-sm">
                <Clock className="w-4 h-4" />
                Avg time to hire: <span className="text-white font-medium">{Math.round(Number(analytics.avg_time_to_hire_days))} days</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Team */}
        <div className="rounded-2xl bg-surface-800 border border-surface-700/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Team</h2>
            <Link href="/dashboard/company/team" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
              Manage <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {team.length === 0
              ? <p className="text-surface-500 text-sm">No team yet. <Link href="/dashboard/company/team/invite" className="text-violet-400 hover:underline">Invite →</Link></p>
              : team.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-700/40 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-semibold text-sm shrink-0">
                    {(m.name || m.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{m.name || m.email}</div>
                    <div className="text-xs text-surface-500 capitalize">{m.effective_role?.replace('_', ' ')}</div>
                  </div>
                </div>
              ))
            }
          </div>
          <div className="mt-3 pt-3 border-t border-surface-700/40 flex items-center justify-between text-xs text-surface-500">
            <span>{team.length}/{company?.max_recruiters ?? 1} seats used</span>
            <div className="flex-1 mx-2 h-1 bg-surface-700 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, (team.length / (company?.max_recruiters || 1)) * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="rounded-2xl bg-surface-800 border border-surface-700/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Active Jobs</h2>
            <Link href="/dashboard/company/jobs" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
              All jobs <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {jobs.length === 0
              ? <p className="text-surface-500 text-sm">No jobs posted yet.</p>
              : jobs.map((job: any) => (
                <Link key={job.id} href={`/dashboard/company/jobs/${job.id}`}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-700/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{job.title}</div>
                    <div className="text-xs text-surface-500">{job.applications_count ?? 0} applicants</div>
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-2',
                    job.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-600/50 text-surface-400')}>
                    {job.is_active ? 'Live' : 'Closed'}
                  </span>
                </Link>
              ))
            }
          </div>
        </div>

        {/* Activity Feed */}
        <div className="rounded-2xl bg-surface-800 border border-surface-700/60 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold text-white">Activity</h2>
          </div>
          <div className="space-y-3">
            {activity.length === 0
              ? <p className="text-surface-500 text-sm">No activity yet.</p>
              : activity.slice(0, 6).map((ev: any) => (
                <div key={ev.id} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 shrink-0" />
                  <div>
                    <div className="text-xs text-surface-300">
                      {ev.candidate?.full_name && <span className="font-medium text-white">{ev.candidate.full_name} — </span>}
                      {ev.event_type.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-surface-600">{formatRelative(ev.created_at)}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Plan upgrade CTA */}
      {company && (company.subscription_plan === 'starter' || company.subscription_plan === 'growth') && (
        <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-600/5 border border-violet-500/20 p-6 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white capitalize">{company.subscription_plan} Plan</h3>
            <p className="text-surface-400 text-sm mt-0.5">
              {team.length}/{company.max_recruiters} team seats · {jobs.filter((j: any) => j.is_active).length}/{company.max_active_jobs} active jobs
            </p>
          </div>
          <Link href="/dashboard/company/settings/billing"
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors shrink-0">
            Upgrade Plan
          </Link>
        </div>
      )}
    </div>
  );
}
