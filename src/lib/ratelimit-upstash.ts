import { Ratelimit } from '@upstash/ratelimit';
import { upstash } from './redis-upstash';

export const userRateLimit = upstash
  ? new Ratelimit({
      redis: upstash,
      limiter: Ratelimit.slidingWindow(100, '1 h'),
      analytics: true,
      prefix: 'ratelimit:user',
    })
  : null;

export const ipRateLimit = upstash
  ? new Ratelimit({
      redis: upstash,
      limiter: Ratelimit.slidingWindow(20, '1 m'),
      analytics: true,
      prefix: 'ratelimit:ip',
    })
  : null;

export const strictRateLimit = upstash
  ? new Ratelimit({
      redis: upstash,
      limiter: Ratelimit.slidingWindow(5, '1 m'),
      analytics: true,
      prefix: 'ratelimit:strict',
    })
  : null;

export const apiRateLimit = upstash
  ? new Ratelimit({
      redis: upstash,
      limiter: Ratelimit.slidingWindow(120, '1 m'),
      analytics: true,
      prefix: 'ratelimit:api',
    })
  : null;

export async function checkRateLimit(
  identifier: string,
  limiter: typeof apiRateLimit
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  if (!limiter) {
    return { success: true, limit: 999999, remaining: 999999, reset: Date.now() + 3600000 };
  }
  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}
