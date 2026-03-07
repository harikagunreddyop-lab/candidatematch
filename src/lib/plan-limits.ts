/**
 * Centralized company plan limits and success fees.
 * DB plan values: starter | growth | enterprise | unlimited
 * Display: Starter ($299), Professional/growth ($799), Enterprise ($2,499+)
 */

export type CompanyPlanId = 'starter' | 'growth' | 'enterprise' | 'unlimited';

export interface CompanyPlanLimits {
  max_recruiters: number;
  max_active_jobs: number;
  /** -1 = unlimited */
  max_candidates_viewed: number;
  max_ai_calls_per_day: number;
  /** Success fee per hire in cents (USD) */
  success_fee_cents: number;
  /** Display name for UI */
  displayName: string;
  /** Monthly price in cents (for display only; Stripe holds actual prices) */
  monthly_price_cents: number;
}

const PLANS: Record<CompanyPlanId, CompanyPlanLimits> = {
  starter: {
    max_recruiters: 1,
    max_active_jobs: 3,
    max_candidates_viewed: 50,
    max_ai_calls_per_day: 50,
    success_fee_cents: 399_900, // $3,999
    displayName: 'Starter',
    monthly_price_cents: 299_00, // $299
  },
  growth: {
    max_recruiters: 3,
    max_active_jobs: 10,
    max_candidates_viewed: -1, // unlimited
    max_ai_calls_per_day: 200,
    success_fee_cents: 299_900, // $2,999
    displayName: 'Professional',
    monthly_price_cents: 799_00, // $799
  },
  enterprise: {
    max_recruiters: 999,
    max_active_jobs: 999,
    max_candidates_viewed: -1,
    max_ai_calls_per_day: 1000,
    success_fee_cents: 199_900, // $1,999
    displayName: 'Enterprise',
    monthly_price_cents: 249_900, // $2,499
  },
  unlimited: {
    max_recruiters: 999,
    max_active_jobs: 999,
    max_candidates_viewed: -1,
    max_ai_calls_per_day: 1000,
    success_fee_cents: 199_900,
    displayName: 'Enterprise',
    monthly_price_cents: 249_900,
  },
};

/** Default limits when plan is unknown (e.g. trialing) */
const DEFAULT_LIMITS: CompanyPlanLimits = PLANS.starter;

/**
 * Get plan limits by plan id. Use for enforcement and webhook updates.
 */
export function getCompanyPlanLimits(plan: string | null | undefined): CompanyPlanLimits {
  if (!plan || !isCompanyPlanId(plan)) return DEFAULT_LIMITS;
  return PLANS[plan];
}

export function isCompanyPlanId(plan: string): plan is CompanyPlanId {
  return plan === 'starter' || plan === 'growth' || plan === 'enterprise' || plan === 'unlimited';
}

/** Success fee in cents by plan (for agreements and invoices) */
export const SUCCESS_FEE_CENTS: Record<CompanyPlanId, number> = {
  starter: 399_900,
  growth: 299_900,
  enterprise: 199_900,
  unlimited: 199_900,
};

/** Display name by plan id */
export const PLAN_DISPLAY_NAMES: Record<CompanyPlanId, string> = {
  starter: 'Starter',
  growth: 'Professional',
  enterprise: 'Enterprise',
  unlimited: 'Enterprise',
};

/** Check if candidate views are unlimited for this plan */
export function hasUnlimitedCandidateViews(plan: string | null | undefined): boolean {
  const limits = getCompanyPlanLimits(plan);
  return limits.max_candidates_viewed === -1;
}

/**
 * Check if company can add one more active job (for enforcement before job create/activate).
 */
export async function checkCompanyActiveJobLimit(
  supabase: { from: (table: string) => any },
  companyId: string,
): Promise<{ allowed: boolean; current: number; max: number }> {
  const [companyRes, countRes] = await Promise.all([
    supabase.from('companies').select('subscription_plan, max_active_jobs').eq('id', companyId).single(),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
  ]);
  const company = companyRes.data;
  const max = company?.max_active_jobs ?? getCompanyPlanLimits(company?.subscription_plan).max_active_jobs;
  const current = countRes.count ?? 0;
  return { allowed: current < max, current, max };
}
