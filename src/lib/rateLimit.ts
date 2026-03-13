import { incrementCounter, getCounter } from '@/lib/redis-upstash';
import { PLANS, type PlanKey } from '@/lib/plans';

const ONE_DAY_SECONDS = 60 * 60 * 24;

/** Build Redis key: apply:limit:{userId}:{YYYY-MM-DD} */
function applicationsKey(userId: string, date: Date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  return `apply:limit:${userId}:${iso}`;
}

export async function incrementDailyApplications(userId: string): Promise<number> {
  const key = applicationsKey(userId);
  return incrementCounter(key, ONE_DAY_SECONDS);
}

export async function getDailyApplications(userId: string): Promise<number> {
  const key = applicationsKey(userId);
  return getCounter(key);
}

export function getDailyApplicationLimit(plan: PlanKey): number {
  return PLANS[plan].appsPerDay;
}

