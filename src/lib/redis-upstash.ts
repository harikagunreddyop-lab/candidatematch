/**
 * Upstash Redis only (no ioredis). Safe to import from Edge routes.
 * Use @/lib/redis for Node routes (re-exports this + ioredis).
 */
import { Redis } from '@upstash/redis';

export const upstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  if (!upstash) return fetcher();
  try {
    const raw = await upstash.get<string>(key);
    if (raw !== null) return JSON.parse(raw) as T;
    const data = await fetcher();
    await upstash.setex(key, ttlSeconds, JSON.stringify(data));
    return data;
  } catch (err) {
    console.warn('[CACHE]', key, err);
    return fetcher();
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  if (!upstash) return;
  try {
    const keys = await upstash.keys(pattern);
    if (keys.length > 0) {
      await upstash.del(...keys);
    }
  } catch (err) {
    console.warn('[CACHE INVALIDATE]', err);
  }
}

export async function incrementCounter(key: string, ttlSeconds?: number): Promise<number> {
  if (!upstash) return 0;
  const value = await upstash.incr(key);
  if (ttlSeconds && value === 1) {
    await upstash.expire(key, ttlSeconds);
  }
  return value;
}

/** Get current counter value without incrementing (for feature-gate checks). */
export async function getCounter(key: string): Promise<number> {
  if (!upstash) return 0;
  const v = await upstash.get<string | number>(key);
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseInt(String(v), 10) || 0;
}

// ── Query cache (hot reads, invalidate on write) ─────────────────────────────

const QUERY_PREFIX = 'query:';

/** Build a stable cache key from segments (e.g. ['company', companyId, 'jobs']). */
export function queryCacheKey(segments: (string | number)[]): string {
  return QUERY_PREFIX + segments.join(':');
}

/** Cache a query result. Use queryCacheKey() for key; invalidate with invalidateQueries() on write. */
export async function cachedQuery<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  return cached(key, ttlSeconds, fetcher);
}

/** Invalidate all query keys under a scope (e.g. 'company:uuid' invalidates query:company:uuid:*). */
export async function invalidateQueries(scope: string): Promise<void> {
  const pattern = scope.startsWith(QUERY_PREFIX) ? `${scope}*` : `${QUERY_PREFIX}${scope}*`;
  await invalidateCache(pattern);
}
