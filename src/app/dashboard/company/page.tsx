'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import Image from 'next/image';
import {
  DollarSign,
  Plus,
  Building2,
  UserPlus,
  Zap,
  BarChart2,
} from 'lucide-react';
import { cn, formatRelative } from '@/utils/helpers';
import type { Company } from '@/types';
import {
  DashboardMetricsGrid,
  HiringFunnelChart,
} from '@/components/company/analytics';
import type { DashboardMetrics, FunnelData } from '@/components/company/analytics';

export default function CompanyDashboard() {
  const [data, setData] = useState<{
    profile: { name?: string; company_id: string; effective_role?: string } | null;
    company: Company | null;
    team: { id: string; name: string | null; email: string | null; effective_role: string }[];
    teamPerf: Record<string, { hires_completed: number; interviews_secured: number; total_candidates: number }>;
    recentJobs: { id: string; title: string; is_active: boolean; applications_count: number; created_at: string }[];
    successFeesPendingCents: number;
    activity: { id: string; event_type: string; created_at: string; candidate?: { full_name: string } | { full_name: string }[] | null }[];
  } | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [funnel, setFunnel] = useState<FunnelData[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    if (!data?.company) return;
    let cancelled = false;
    setMetricsLoading(true);
    Promise.all([
      fetch('/api/company/analytics/metrics').then((r) => r.ok ? r.json() : null),
      fetch('/api/company/analytics/funnel?period=30d').then((r) => r.ok ? r.json() : null),
    ]).then(([metricsRes, funnelRes]) => {
      if (cancelled) return;
      setMetrics(metricsRes ?? null);
      setFunnel(funnelRes?.funnel ?? []);
      setMetricsLoading(false);
    }).catch(() => {
      if (!cancelled) setMetricsLoading(false);
    });
    return () => { cancelled = true; };
  }, [data?.company]);

  async function loadDashboard() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profile_roles')
      .select('company_id, name, effective_role')
      .eq('id', session.user.id)
      .single();

    if (!profile?.company_id) {
      setData({
        profile: profile ?? null,
        company: null,
        team: [],
        teamPerf: {},
        recentJobs: [],
        successFeesPendingCents: 0,
        activity: [],
      });
      setLoading(false);
      return;
    }

    const companyId = profile.company_id;

    const [
      companyRes,
      teamRes,
      recentJobsRes,
      successFeesRes,
      activityRes,
      perfRes,
    ] = await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).single(),
      supabase
        .from('profile_roles')
        .select('id, name, email, effective_role')
        .eq('company_id', companyId)
        .in('effective_role', ['company_admin', 'recruiter']),
      supabase
        .from('jobs')
        .select('id, title, is_active, applications_count, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('success_fee_events')
        .select('amount_cents')
        .eq('company_id', companyId)
        .eq('status', 'pending'),
      supabase
        .from('candidate_activity')
        .select('id, event_type, created_at, candidate:candidates(full_name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('recruiter_performance')
        .select('recruiter_id, hires_completed, interviews_secured, total_candidates')
        .eq('company_id', companyId),
    ]);

    const team = (teamRes.data || []) as { id: string; name: string | null; email: string | null; effective_role: string }[];
    const perfList = (perfRes.data || []) as {
      recruiter_id: string;
      hires_completed: number;
      interviews_secured: number;
      total_candidates: number;
    }[];
    const teamPerf: Record<string, { hires_completed: number; interviews_secured: number; total_candidates: number }> = {};
    perfList.forEach((p) => {
      teamPerf[p.recruiter_id] = {
        hires_completed: p.hires_completed ?? 0,
        interviews_secured: p.interviews_secured ?? 0,
        total_candidates: p.total_candidates ?? 0,
      };
    });

    const successFeesPendingCents =
      (successFeesRes.data || []).reduce((sum: number, r: { amount_cents?: number }) => sum + (r.amount_cents ?? 0), 0) ?? 0;

    setData({
      profile,
      company: companyRes.data ?? null,
      team,
      teamPerf,
      recentJobs: (recentJobsRes.data || []) as {
        id: string;
        title: string;
        is_active: boolean;
        applications_count: number;
        created_at: string;
      }[],
      successFeesPendingCents,
      activity: (activityRes.data || []) as {
        id: string;
        event_type: string;
        created_at: string;
        candidate?: { full_name: string } | { full_name: string }[] | null;
      }[],
    });
    setLoading(false);
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );

  if (!data?.company)
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Building2 className="w-12 h-12 text-surface-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">No company linked</h2>
        <p className="text-surface-400">
          Contact your platform administrator to link your account to a company.
        </p>
      </div>
    );

  const { company, team, teamPerf, recentJobs, successFeesPendingCents, activity } = data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          {company?.logo_url ? (
            <Image
              src={company.logo_url}
              alt={company.name}
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl object-cover"
              unoptimized
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-brand-400/20 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-brand-400" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-white">{company.name}</h1>
            <p className="text-surface-400 mt-1">Company Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/company/analytics"
            className="flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600 text-white rounded-lg font-medium transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            Analytics
          </Link>
          <Link
            href="/dashboard/company/team/invite"
            className="flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600 text-white rounded-lg font-medium transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </Link>
          <Link
            href="/dashboard/company/jobs/new"
            className="flex items-center gap-2 px-4 py-2 bg-brand-400 hover:bg-brand-300 text-[#0a0f00] rounded-lg font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Post Job
          </Link>
        </div>
      </div>

      {/* Dashboard metrics grid */}
      <DashboardMetricsGrid metrics={metrics} loading={metricsLoading} />

      {/* Success fee tracking */}
      {successFeesPendingCents > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-amber-400" />
            <div>
              <div className="font-semibold text-white">Success fees owed</div>
              <div className="text-sm text-surface-400">
                ${(successFeesPendingCents / 100).toLocaleString()} pending
              </div>
            </div>
          </div>
          <Link
            href="/dashboard/company/settings/billing"
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            View billing
          </Link>
        </div>
      )}

      {/* Hiring funnel */}
      <HiringFunnelChart
        data={funnel}
        loading={metricsLoading}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Jobs */}
        <div className="bg-surface-800/50 border border-surface-700/60 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Recent Jobs</h2>
            <Link
              href="/dashboard/company/jobs"
              className="text-sm text-brand-400 hover:text-brand-300"
            >
              View All →
            </Link>
          </div>
          <div className="space-y-3">
            {recentJobs.length === 0 ? (
              <p className="text-surface-500 text-sm">No jobs posted yet.</p>
            ) : (
              recentJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/dashboard/company/jobs/${job.id}`}
                  className="flex items-center justify-between p-4 bg-surface-900/50 rounded-lg hover:bg-surface-900 transition-colors"
                >
                  <div>
                    <div className="font-medium text-white">{job.title}</div>
                    <div className="text-xs text-surface-500 mt-1">
                      {job.applications_count || 0} applications •{' '}
                      {new Date(job.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium',
                      job.is_active
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-surface-500/10 text-surface-400'
                    )}
                  >
                    {job.is_active ? 'Active' : 'Closed'}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Team + performance */}
        <div className="bg-surface-800/50 border border-surface-700/60 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Team</h2>
            <Link
              href="/dashboard/company/team/invite"
              className="text-sm text-brand-400 hover:text-brand-300"
            >
              Invite Member →
            </Link>
          </div>
          <div className="space-y-3">
            {team.length === 0 ? (
              <p className="text-surface-500 text-sm">
                No team yet. <Link href="/dashboard/company/team/invite" className="text-brand-400 hover:underline">Invite →</Link>
              </p>
            ) : (
              team.map((member) => {
                const perf = teamPerf[member.id];
                return (
                  <div
                    key={member.id}
                    className="p-4 bg-surface-900/50 rounded-lg border border-surface-700/40"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{member.name || member.email || 'Unknown'}</div>
                        <div className="text-xs text-surface-500">{member.email}</div>
                      </div>
                      <span className="px-2 py-1 bg-brand-400/10 text-brand-400 text-xs font-medium rounded capitalize">
                        {member.effective_role?.replace('_', ' ')}
                      </span>
                    </div>
                    {perf && (perf.hires_completed > 0 || perf.interviews_secured > 0) && (
                      <div className="mt-2 flex gap-4 text-xs text-surface-400">
                        <span>{perf.interviews_secured} interviews</span>
                        <span>{perf.hires_completed} hires</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {company && team.length > 0 && (
            <div className="mt-3 pt-3 border-t border-surface-700/40 flex items-center justify-between text-xs text-surface-500">
              <span>
                {team.length} / {company.max_recruiters ?? 1} seats used
              </span>
              <div className="flex-1 mx-2 h-1 bg-surface-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-400 rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      (team.length / (company?.max_recruiters || 1)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Activity */}
        <div className="bg-surface-800/50 border border-surface-700/60 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-amber-400" />
            <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
          </div>
          <div className="space-y-3">
            {activity.length === 0 ? (
              <p className="text-surface-500 text-sm">No activity yet.</p>
            ) : (
              activity.slice(0, 6).map((ev) => {
                const candidateName = Array.isArray(ev.candidate)
                  ? ev.candidate[0]?.full_name
                  : (ev.candidate as { full_name?: string } | null)?.full_name;
                return (
                  <div key={ev.id} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 shrink-0" />
                    <div>
                      <div className="text-xs text-surface-300">
                        {candidateName && (
                          <span className="font-medium text-white">{candidateName} — </span>
                        )}
                        {ev.event_type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs text-surface-600">
                        {formatRelative(ev.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Billing CTA */}
      {company &&
        (company.subscription_plan === 'starter' || company.subscription_plan === 'growth') && (
          <div className="rounded-2xl bg-gradient-to-br from-brand-400/10 to-brand-600/5 border border-brand-400/20 p-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white capitalize">
                {company.subscription_plan} Plan
              </h3>
              <p className="text-surface-400 text-sm mt-0.5">
                {team.length} / {company.max_recruiters} team seats ·{' '}
                {recentJobs.filter((j) => j.is_active).length} / {company.max_active_jobs} active
                jobs
              </p>
            </div>
            <Link
              href="/dashboard/company/settings/billing"
              className="px-4 py-2 bg-brand-400 hover:bg-brand-300 text-[#0a0f00] rounded-xl text-sm font-semibold transition-colors shrink-0"
            >
              Upgrade Plan
            </Link>
          </div>
        )}
    </div>
  );
}
