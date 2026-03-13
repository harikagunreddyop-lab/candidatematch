export const PLANS = {
  FREE: {
    id: 'free',
    name: 'Free',
    price: 0,
    appsPerDay: 20,
    stripePriceId: null as string | null,
  },
  PRO: {
    id: 'pro',
    name: 'Pro',
    price: 14.99,
    appsPerDay: 40,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
  },
  PRO_PLUS: {
    id: 'pro_plus',
    name: 'Pro Plus',
    price: 29.99,
    appsPerDay: 80,
    stripePriceId: process.env.STRIPE_PRO_PLUS_PRICE_ID ?? null,
  },
  ELITE: {
    id: 'elite',
    name: 'Elite',
    price: 99,
    appsPerDay: 9999,
    stripePriceId: process.env.STRIPE_ELITE_PRICE_ID ?? null,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export const PLAN_FEATURES = {
  resumeDownload: ['PRO', 'PRO_PLUS', 'ELITE'],
  atsBreakdown: ['PRO', 'PRO_PLUS', 'ELITE'],
  resumeTailoring: ['PRO', 'PRO_PLUS', 'ELITE'],
  recruiterVisibility: ['PRO', 'PRO_PLUS', 'ELITE'],
  profileViewers: ['PRO', 'PRO_PLUS', 'ELITE'],
  bulkApply: ['PRO_PLUS', 'ELITE'],
  autoApply: ['PRO_PLUS', 'ELITE'],
  applicationAnalytics: ['PRO', 'PRO_PLUS', 'ELITE'],
  resumeCoaching: ['PRO_PLUS', 'ELITE'],
  interviewScore: ['PRO_PLUS', 'ELITE'],
  dedicatedAdvisor: ['ELITE'],
} as const;

export type FeatureKey = keyof typeof PLAN_FEATURES;

export function canAccess(userPlan: PlanKey, feature: FeatureKey): boolean {
  return (PLAN_FEATURES[feature] as readonly string[]).includes(userPlan);
}

/** Map subscription_tier from DB to PlanKey used by this module. */
export function subscriptionTierToPlanKey(
  tier: 'free' | 'pro' | 'pro_plus' | 'enterprise' | null | undefined,
): PlanKey {
  if (tier === 'pro') return 'PRO';
  if (tier === 'pro_plus') return 'PRO_PLUS';
  if (tier === 'enterprise') return 'ELITE';
  return 'FREE';
}

