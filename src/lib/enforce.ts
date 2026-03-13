import { canAccess, type FeatureKey, type PlanKey } from '@/lib/plans';

export class UpgradeRequiredError extends Error {
  feature: FeatureKey;

  constructor(feature: FeatureKey) {
    super(`Upgrade required to access ${feature}`);
    this.name = 'UpgradeRequiredError';
    this.feature = feature;
  }
}

export function requirePlan(userPlan: PlanKey, feature: FeatureKey): void {
  if (!canAccess(userPlan, feature)) {
    throw new UpgradeRequiredError(feature);
  }
}

