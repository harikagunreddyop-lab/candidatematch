'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import {
  PLAN_DISPLAY_NAMES,
  getCompanyPlanLimits,
} from '@/lib/plan-limits';
import type { CompanyPlanId } from '@/lib/plan-limits';
import {
  CreditCard,
  Users,
  Briefcase,
  Eye,
  Loader2,
  DollarSign,
  FileText,
} from 'lucide-react';

export default function CompanySettingsBillingPage() {
  const [company, setCompany] = useState<{
    id: string;
    name?: string;
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
  const [successFeesPendingCents, setSuccessFeesPendingCents] = useState(0);
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

      const now = new Date();
      const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);

      const [companyRes, teamRes, jobsRes, usageRes, successFeesRes] = await Promise.all([
        supabase
          .from('companies')
          .select('id, name, subscription_plan, subscription_status, subscription_period_end, max_recruiters, max_active_jobs, max_candidates_viewed, stripe_customer_id')
          .eq('id', profile.company_id)
          .single(),
        supabase
          .from('profile_roles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', profile.company_id)
          .in('effective_role', ['company_admin', 'recruiter']),
        supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', profile.company_id)
          .eq('is_active', true),
        supabase
          .from('company_usage')
          .select('candidates_viewed')
          .eq('company_id', profile.company_id)
          .eq('usage_month', firstDay)
          .maybeSingle(),
        supabase
          .from('success_fee_events')
          .select('amount_cents')
          .eq('company_id', profile.company_id)
          .eq('status', 'pending'),
      ]);

      setCompany(companyRes.data ?? null);
      setTeamCount(teamRes.count ?? 0);
      setActiveJobsCount(jobsRes.count ?? 0);
      setCandidatesViewedThisMonth(usageRes.data?.candidates_viewed ?? 0);
      setSuccessFeesPendingCents(
        (successFeesRes.data || []).reduce((sum: number, r: { amount_cents?: number }) => sum + (r.amount_cents ?? 0), 0)
      );
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
  const planLimits = getCompanyPlanLimits(company.subscription_plan);
  const periodEnd = company.subscription_period_end
    ? new Date(company.subscription_period_end).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null;
  const candidatesLabel =
    company.max_candidates_viewed >= 999 || planLimits.max_candidates_viewed === -1
      ? 'Unlimited'
      : `${candidatesViewedThisMonth ?? 0} / ${company.max_candidates_viewed}`;
  const successFeesOwedFormatted =
    successFeesPendingCents > 0 ? `$${(successFeesPendingCents / 100).toLocaleString()}` : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">Billing</h1>
        <p className="text-surface-500 dark:text-surface-400">
          Manage your subscription, payment method, and usage.
        </p>
      </div>

      {/* Current plan */}
      <section className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-violet-500" />
          </div>
          <div>
            <h2 className="font-semibold text-surface-900 dark:text-white">Current plan</h2>
            <p className="text-sm text-surface-500 capitalize">
              {planName} · {company.subscription_status}
            </p>
          </div>
        </div>
        {periodEnd && (
          <p className="text-xs text-surface-500 mb-4">Billing period ends {periodEnd}</p>
        )}
        <div className="flex flex-wrap gap-2">
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
              Manage payment method
            </button>
          )}
        </div>
      </section>

      {/* Usage metrics */}
      <section>
        <h2 className="text-lg font-semibold text-surface-900 dark:text-white mb-4">Usage</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-surface-500" />
              <h3 className="font-semibold text-surface-900 dark:text-white">Team seats</h3>
            </div>
            <p className="text-2xl font-bold text-surface-900 dark:text-white">
              {teamCount} / {company.max_recruiters}
            </p>
            <p className="text-xs text-surface-500 mt-1">Used on your plan</p>
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Briefcase className="w-5 h-5 text-surface-500" />
              <h3 className="font-semibold text-surface-900 dark:text-white">Active jobs</h3>
            </div>
            <p className="text-2xl font-bold text-surface-900 dark:text-white">
              {activeJobsCount} / {company.max_active_jobs}
            </p>
            <p className="text-xs text-surface-500 mt-1">Posted and active</p>
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Eye className="w-5 h-5 text-surface-500" />
              <h3 className="font-semibold text-surface-900 dark:text-white">Profiles viewed</h3>
            </div>
            <p className="text-2xl font-bold text-surface-900 dark:text-white">{candidatesLabel}</p>
            <p className="text-xs text-surface-500 mt-1">This month</p>
          </div>

          {successFeesOwedFormatted && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 p-6">
              <div className="flex items-center gap-3 mb-2">
                <DollarSign className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-surface-900 dark:text-white">Success fees owed</h3>
              </div>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {successFeesOwedFormatted}
              </p>
              <p className="text-xs text-surface-500 mt-1">Pending (hire-based fees)</p>
              <button
                type="button"
                onClick={openPortal}
                disabled={portalLoading}
                className="mt-3 text-sm text-amber-600 dark:text-amber-400 hover:underline font-medium"
              >
                Pay in billing portal
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Invoice history */}
      <section className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-5 h-5 text-surface-500" />
          <h2 className="font-semibold text-surface-900 dark:text-white">Invoice history</h2>
        </div>
        <p className="text-surface-600 dark:text-surface-400 text-sm mb-4">
          View and download past invoices, update your payment method, and manage billing details in the Stripe customer portal.
        </p>
        {company.stripe_customer_id ? (
          <button
            type="button"
            onClick={openPortal}
            disabled={portalLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 text-sm font-medium transition disabled:opacity-60"
          >
            {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Open billing portal
          </button>
        ) : (
          <p className="text-sm text-surface-500">Complete a plan upgrade to access the billing portal and invoices.</p>
        )}
      </section>
    </div>
  );
}
