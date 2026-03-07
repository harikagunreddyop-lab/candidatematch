'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { PLAN_DISPLAY_NAMES } from '@/lib/plan-limits';
import type { CompanyPlanId } from '@/lib/plan-limits';
import { CreditCard, Users, Briefcase, Eye, Loader2 } from 'lucide-react';

export default function CompanySettingsBillingPage() {
  const [company, setCompany] = useState<{
    id: string;
    subscription_plan: string;
    subscription_status: string;
    subscription_period_end: string | null;
    max_recruiters: number;
    max_active_jobs: number;
    max_candidates_viewed: number;
    stripe_customer_id: string | null;
  } | null>(null);
  const [teamCount, setTeamCount] = useState(0);
  const [activeJobsCount, setActiveJobsCount] = useState(0);
  const [candidatesViewedThisMonth, setCandidatesViewedThisMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from('profile_roles')
        .select('company_id')
        .eq('id', session.user.id)
        .single();

      if (!profile?.company_id) { setLoading(false); return; }

      const [companyRes, teamRes, jobsRes, usageRes] = await Promise.all([
        supabase
          .from('companies')
          .select('id, subscription_plan, subscription_status, subscription_period_end, max_recruiters, max_active_jobs, max_candidates_viewed, stripe_customer_id')
          .eq('id', profile.company_id)
          .single(),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', profile.company_id)
          .in('effective_role', ['company_admin', 'recruiter']),
        supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', profile.company_id)
          .eq('is_active', true),
        (() => {
          const now = new Date();
          const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
          return supabase
            .from('company_usage')
            .select('candidates_viewed')
            .eq('company_id', profile.company_id)
            .eq('usage_month', firstDay)
            .maybeSingle();
        })(),
      ]);

      setCompany(companyRes.data ?? null);
      setTeamCount(teamRes.count ?? 0);
      setActiveJobsCount(jobsRes.count ?? 0);
      setCandidatesViewedThisMonth(usageRes.data?.candidates_viewed ?? 0);
      setLoading(false);
    })();
  }, [supabase]);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/company-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || 'Could not open billing portal');
    } catch {
      alert('Something went wrong');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">Billing</h1>
        <p className="text-surface-500">No company found. Link your account to a company to manage billing.</p>
      </div>
    );
  }

  const planName = PLAN_DISPLAY_NAMES[company.subscription_plan as CompanyPlanId] ?? company.subscription_plan;
  const periodEnd = company.subscription_period_end
    ? new Date(company.subscription_period_end).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null;
  const candidatesLabel = company.max_candidates_viewed >= 999
    ? 'Unlimited'
    : `${candidatesViewedThisMonth ?? 0} / ${company.max_candidates_viewed}`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">Billing</h1>
      <p className="text-surface-500 dark:text-surface-400">Manage your subscription and usage.</p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="font-semibold text-surface-900 dark:text-white">Current plan</h2>
              <p className="text-sm text-surface-500 capitalize">{planName} · {company.subscription_status}</p>
            </div>
          </div>
          {periodEnd && (
            <p className="text-xs text-surface-500">Period ends {periodEnd}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition"
            >
              Upgrade plan
            </Link>
            {company.stripe_customer_id && (
              <button
                type="button"
                onClick={openPortal}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 text-sm font-medium transition disabled:opacity-60"
              >
                {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Manage billing
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-surface-500" />
            <h2 className="font-semibold text-surface-900 dark:text-white">Team seats</h2>
          </div>
          <p className="text-2xl font-bold text-surface-900 dark:text-white">{teamCount} / {company.max_recruiters}</p>
          <p className="text-xs text-surface-500 mt-1">Used on your plan</p>
        </div>

        <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Briefcase className="w-5 h-5 text-surface-500" />
            <h2 className="font-semibold text-surface-900 dark:text-white">Active jobs</h2>
          </div>
          <p className="text-2xl font-bold text-surface-900 dark:text-white">{activeJobsCount} / {company.max_active_jobs}</p>
          <p className="text-xs text-surface-500 mt-1">Posted and active</p>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6">
        <div className="flex items-center gap-3 mb-2">
          <Eye className="w-5 h-5 text-surface-500" />
          <h2 className="font-semibold text-surface-900 dark:text-white">Candidate profiles viewed</h2>
        </div>
        <p className="text-surface-600 dark:text-surface-400">{candidatesLabel} this month</p>
        <p className="text-xs text-surface-500 mt-1">Viewable candidate profiles per month (upgrade for unlimited)</p>
      </div>
    </div>
  );
}
