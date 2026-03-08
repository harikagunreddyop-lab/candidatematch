/**
 * Product feature flags (Redis-backed): gradual rollouts, A/B tests.
 * Distinct from feature-gates.ts (plan limits: view_candidate, post_job, ai_call).
 */
import { upstash } from '@/lib/redis-upstash';

const PREFIX = 'feature_flag:';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercentage?: number;
  enabledFor?: string[];
  metadata?: Record<string, unknown>;
}

export async function getFeatureFlag(key: string): Promise<FeatureFlag | null> {
  if (!upstash) return null;
  const data = await upstash.get<string>(`${PREFIX}${key}`);
  if (!data) return null;
  try {
    return JSON.parse(data) as FeatureFlag;
  } catch {
    return null;
  }
}

export async function setFeatureFlag(flag: FeatureFlag): Promise<void> {
  if (!upstash) return;
  await upstash.set(`${PREFIX}${flag.key}`, JSON.stringify(flag));
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export async function isFeatureEnabled(
  key: string,
  userId?: string,
  companyId?: string
): Promise<boolean> {
  const flag = await getFeatureFlag(key);
  if (!flag) return false;
  if (!flag.enabled) return false;

  if (flag.enabledFor && flag.enabledFor.length > 0) {
    const id = userId || companyId || '';
    return flag.enabledFor.includes(id);
  }

  if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
    const id = userId || companyId || '';
    const hash = hashString(id || 'anonymous');
    return hash % 100 < flag.rolloutPercentage;
  }

  return true;
}

export const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: 'ai_matching_v2',
    enabled: false,
    rolloutPercentage: 10,
    metadata: { version: 'v2', algorithm: 'enhanced' },
  },
  {
    key: 'resume_builder_new_ui',
    enabled: false,
    rolloutPercentage: 0,
    metadata: { version: 'v3' },
  },
  {
    key: 'interview_prep_ai_coach',
    enabled: true,
    rolloutPercentage: 100,
  },
  {
    key: 'gmail_integration',
    enabled: true,
    rolloutPercentage: 100,
  },
];

export async function initializeFeatureFlags(): Promise<void> {
  if (!upstash) return;
  for (const flag of DEFAULT_FLAGS) {
    const exists = await getFeatureFlag(flag.key);
    if (!exists) {
      await setFeatureFlag(flag);
    }
  }
}

/** List all flag keys (scan Redis prefix). Use for admin UI. */
export async function listFeatureFlagKeys(): Promise<string[]> {
  if (!upstash) return [];
  const keys = await upstash.keys(`${PREFIX}*`);
  return keys.map((k: string) => k.replace(PREFIX, ''));
}
