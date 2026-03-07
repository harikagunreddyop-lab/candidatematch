/**
 * GET /api/health — Liveness/readiness for Amplify, UptimeRobot, or load balancers.
 * Returns 200 when DB is reachable; optional Redis (ioredis) and cache (Upstash) checks.
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getRedis, upstash } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, string> = {
    database: 'unknown',
  };
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  try {
    const supabase = createServiceClient();
    const { error: dbError } = await supabase.from('jobs').select('id').limit(1).maybeSingle();
    checks.database = dbError ? 'unhealthy' : 'healthy';
    if (dbError) status = 'unhealthy';
  } catch (e) {
    checks.database = 'unhealthy';
    status = 'unhealthy';
  }

  if (process.env.REDIS_URL) {
    try {
      const redis = getRedis();
      if (redis) {
        const pong = await redis.ping();
        checks.redis = pong === 'PONG' ? 'healthy' : 'unhealthy';
      } else {
        checks.redis = 'unavailable';
      }
      if (checks.redis === 'unhealthy') status = status === 'healthy' ? 'degraded' : status;
    } catch {
      checks.redis = 'unhealthy';
      if (status === 'healthy') status = 'degraded';
    }
  } else {
    checks.redis = 'not_configured';
  }

  if (upstash) {
    try {
      await upstash.ping();
      checks.cache = 'healthy';
    } catch {
      checks.cache = 'unhealthy';
      if (status === 'healthy') status = 'degraded';
    }
  } else {
    checks.cache = 'not_configured';
  }

  const body = {
    status,
    timestamp: new Date().toISOString(),
    checks,
  };

  return NextResponse.json(body, {
    status: status === 'unhealthy' ? 503 : 200,
  });
}

