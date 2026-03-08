/**
 * Feature gates for candidate plans: check access by plan features and usage limits.
 */

import { createServiceClient } from '@/lib/supabase-server';

export type FeatureGateResult =
  | { allowed: true }
  | { allowed: false; reason: 'upgrade_required'; plan: string }
  | { allowed: false; reason: 'limit_reached'; limit: number; used: number; plan: string };

const FREE_PLAN_FEATURES: string[] = ['job_search', 'basic_profile', '5_applications'];
const FREE_PLAN_LIMITS: Record<string, number> = {
  applications_per_month: 5,
  resume_generations: 1,
  job_alerts: 0,
};

/** Current calendar month period (start/end date) for usage. */
function getCurrentPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/** Map feature key to usage column and limit key. */
const FEATURE_TO_USAGE: Record<string, { usageKey: string; limitKey: string }> = {
  applications: { usageKey: 'applications_used', limitKey: 'applications_per_month' },
  resume_generation: { usageKey: 'resume_generations_used', limitKey: 'resume_generations' },
  job_alerts: { usageKey: 'job_alerts_used', limitKey: 'job_alerts' },
};

export class FeatureGate {
  private supabase = createServiceClient();

  /**
   * Check if candidate has access to a feature (included in plan and under limit).
   * feature: 'applications' | 'resume_generation' | 'job_alerts' | 'email_tracking' | 'ai_resume' | etc.
   */
  async checkAccess(candidateId: string, feature: string): Promise<FeatureGateResult> {
    const { data: sub } = await this.supabase
      .from('candidate_subscriptions')
      .select('plan_name')
      .eq('candidate_id', candidateId)
      .in('status', ['active', 'trialing'])
      .maybeSingle();

    let planName = sub?.plan_name;

    if (planName == null) {
      const { data: candidate } = await this.supabase
        .from('candidates')
        .select('user_id')
        .eq('id', candidateId)
        .single();
      if (candidate?.user_id) {
        const { data: profile } = await this.supabase
          .from('profiles')
          .select('subscription_tier')
          .eq('id', candidate.user_id)
          .single();
        if (profile?.subscription_tier && profile.subscription_tier !== 'enterprise') {
          planName = profile.subscription_tier;
        }
      }
    }

    planName = planName ?? 'free';

    const { data: plan } = await this.supabase
      .from('pricing_plans')
      .select('name, features, limits')
      .eq('name', planName)
      .single();

    const features: string[] = plan?.features ?? FREE_PLAN_FEATURES;
    const limits: Record<string, number> = (plan?.limits as Record<string, number>) ?? FREE_PLAN_LIMITS;

    const hasFeature = this.planIncludesFeature(planName, features, feature);
    if (!hasFeature) {
      return { allowed: false, reason: 'upgrade_required', plan: planName };
    }

    const mapping = FEATURE_TO_USAGE[feature];
    if (mapping) {
      const limit = limits[mapping.limitKey] ?? 0;
      if (limit === -1) return { allowed: true };

      const period = getCurrentPeriod();
      const { data: usage } = await this.supabase
        .from('candidate_usage')
        .select(mapping.usageKey)
        .eq('candidate_id', candidateId)
        .eq('period_start', period.start)
        .maybeSingle();

      const used = Number((usage as Record<string, number>)?.[mapping.usageKey] ?? 0);
      if (used >= limit) {
        return { allowed: false, reason: 'limit_reached', limit, used, plan: planName };
      }
    }

    return { allowed: true };
  }

  private planIncludesFeature(planName: string, features: string[], feature: string): boolean {
    if (features.includes(feature)) return true;
    if (planName === 'pro_plus' && (features.includes('all_pro_features') || feature === 'email_tracking' || feature === 'ai_resume')) return true;
    if (planName === 'pro' && (feature === 'email_tracking' || feature === 'ai_resume')) return true;
    if (feature === 'applications' && (features.includes('5_applications') || features.includes('unlimited_applications') || features.includes('all_pro_features'))) return true;
    return false;
  }

  /**
   * Get current usage for the period (for display).
   */
  async getUsage(candidateId: string): Promise<{ applications_used: number; resume_generations_used: number; job_alerts_used: number }> {
    const period = getCurrentPeriod();
    const { data } = await this.supabase
      .from('candidate_usage')
      .select('applications_used, resume_generations_used, job_alerts_used')
      .eq('candidate_id', candidateId)
      .eq('period_start', period.start)
      .maybeSingle();

    return {
      applications_used: data?.applications_used ?? 0,
      resume_generations_used: data?.resume_generations_used ?? 0,
      job_alerts_used: data?.job_alerts_used ?? 0,
    };
  }

  /**
   * Track usage (increment counter). Call after the action is performed.
   */
  async trackUsage(candidateId: string, feature: 'applications' | 'resume_generations' | 'job_alerts'): Promise<void> {
    const period = getCurrentPeriod();
    await this.supabase.rpc('increment_candidate_usage', {
      p_candidate_id: candidateId,
      p_feature: feature,
      p_period_start: period.start,
      p_period_end: period.end,
    });
  }
}

/** Helper for API routes: require feature access or return 403. */
export async function requireFeature(
  candidateId: string,
  feature: string
): Promise<FeatureGateResult> {
  const gate = new FeatureGate();
  return gate.checkAccess(candidateId, feature);
}
