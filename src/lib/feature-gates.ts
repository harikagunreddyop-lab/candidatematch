/**
 * Feature gates for company-scoped limits (plan-based).
 * checkCompanyFeatureAccess: enforce before expensive actions (view candidate, post job, AI call).
 * trackCompanyUsage: record usage for limits (candidates_viewed, ai_call).
 * Return 403 + upgrade_url when over limit; use in API routes.
 */

import { createServiceClient } from '@/lib/supabase-server';
import { getCompanyPlanLimits } from '@/lib/plan-limits';
import { getCounter, incrementCounter } from '@/lib/redis-upstash';
import { getAppUrl } from '@/config';

export type CompanyFeature = 'view_candidate' | 'post_job' | 'ai_call';

export interface FeatureAccessResult {
  allowed: boolean;
  reason?: string;
  upgrade_url?: string;
  current?: number;
  limit?: number;
}

const UPGRADE_PATH = '/dashboard/company/settings/billing';

function upgradeUrl(): string {
  const base = getAppUrl();
  return `${base}${UPGRADE_PATH}`;
}

/**
 * Check if a company can perform the given feature (under plan limits).
 * Pass supabase service client to avoid creating one if caller already has it.
 */
export async function checkCompanyFeatureAccess(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  feature: CompanyFeature
): Promise<FeatureAccessResult> {
  const { data: company } = await supabase
    .from('companies')
    .select('subscription_plan, subscription_status, max_candidates_viewed, max_active_jobs, max_ai_calls_per_day')
    .eq('id', companyId)
    .single();

  if (!company) {
    return { allowed: false, reason: 'Company not found' };
  }

  const limits = getCompanyPlanLimits(company.subscription_plan);
  const maxCandidatesViewed = company.max_candidates_viewed ?? limits.max_candidates_viewed;
  const maxActiveJobs = company.max_active_jobs ?? limits.max_active_jobs;
  const maxAiCallsPerDay = company.max_ai_calls_per_day ?? limits.max_ai_calls_per_day;

  switch (feature) {
    case 'view_candidate': {
      if (maxCandidatesViewed === -1) return { allowed: true };
      const firstDay = new Date();
      firstDay.setDate(1);
      firstDay.setHours(0, 0, 0, 0);
      const usageMonth = firstDay.toISOString().slice(0, 10);
      const { data: usage } = await supabase
        .from('company_usage')
        .select('candidates_viewed')
        .eq('company_id', companyId)
        .eq('usage_month', usageMonth)
        .maybeSingle();
      const current = usage?.candidates_viewed ?? 0;
      const allowed = current < maxCandidatesViewed;
      return {
        allowed,
        current,
        limit: maxCandidatesViewed,
        ...(allowed ? {} : { reason: 'Candidate view limit reached for this month', upgrade_url: upgradeUrl() }),
      };
    }
    case 'post_job': {
      const { count } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true);
      const current = count ?? 0;
      const allowed = current < maxActiveJobs;
      return {
        allowed,
        current,
        limit: maxActiveJobs,
        ...(allowed ? {} : { reason: 'Active job limit reached', upgrade_url: upgradeUrl() }),
      };
    }
    case 'ai_call': {
      if (maxAiCallsPerDay === -1) return { allowed: true };
      const today = new Date().toISOString().slice(0, 10);
      const redisKey = `company:${companyId}:ai_calls:${today}`;
      const current = await getCounter(redisKey);
      const allowed = current < maxAiCallsPerDay;
      return {
        allowed,
        current,
        limit: maxAiCallsPerDay,
        ...(allowed ? {} : { reason: 'Daily AI call limit reached', upgrade_url: upgradeUrl() }),
      };
    }
    default:
      return { allowed: false, reason: 'Unknown feature' };
  }
}

export type CompanyUsageEvent = 'view_candidate' | 'ai_call';

/**
 * Track usage for a company (increment counters). Call after the action is allowed and performed.
 */
export async function trackCompanyUsage(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  eventType: CompanyUsageEvent
): Promise<void> {
  if (eventType === 'view_candidate') {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const usageMonth = firstDay.toISOString().slice(0, 10);
    await supabase.rpc('increment_company_usage', {
      p_company_id: companyId,
      p_usage_month: usageMonth,
      p_metric: 'candidates_viewed',
    });
  }
  if (eventType === 'ai_call') {
    const today = new Date().toISOString().slice(0, 10);
    const redisKey = `company:${companyId}:ai_calls:${today}`;
    await incrementCounter(redisKey, 86400 * 2);
  }
}

/**
 * Helper for API routes: check access and return 403 NextResponse when not allowed.
 */
export async function requireCompanyFeature(
  companyId: string,
  feature: CompanyFeature
): Promise<FeatureAccessResult | { error: Response }> {
  const supabase = createServiceClient();
  const result = await checkCompanyFeatureAccess(supabase, companyId, feature);
  if (result.allowed) return result;
  const { NextResponse } = await import('next/server');
  return {
    error: NextResponse.json(
      {
        error: result.reason ?? 'Feature not available',
        upgrade_url: result.upgrade_url,
        current: result.current,
        limit: result.limit,
      },
      { status: 403 }
    ),
  };
}
