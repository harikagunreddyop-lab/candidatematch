/**
 * GET /api/health — Liveness/readiness for Amplify, UptimeRobot, or load balancers.
 * Returns 200 when DB is reachable; optional Redis (ioredis), cache (Upstash), and Anthropic checks.
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getRedis, upstash } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: string; error?: string } | string> = {
    database: 'unknown',
  };
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  try {
    const supabase = createServiceClient();
    const { error: dbError } = await supabase.from('jobs').select('id').limit(1).maybeSingle();
    checks.database = dbError ? { status: 'unhealthy', error: dbError.message } : { status: 'healthy' };
    if (dbError) status = 'unhealthy';
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    checks.database = { status: 'unhealthy', error: err };
    status = 'unhealthy';
  }

  if (process.env.REDIS_URL) {
    try {
      const redis = getRedis();
      if (redis) {
        const pong = await redis.ping();
        checks.redis = pong === 'PONG' ? { status: 'healthy' } : { status: 'unhealthy' };
      } else {
        checks.redis = { status: 'unhealthy', error: 'unavailable' };
      }
      if ((checks.redis as { status: string }).status === 'unhealthy') status = status === 'healthy' ? 'degraded' : status;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      checks.redis = { status: 'unhealthy', error: err };
      if (status === 'healthy') status = 'degraded';
    }
  } else {
    checks.redis = 'not_configured';
  }

  if (upstash) {
    try {
      await upstash.ping();
      checks.cache = { status: 'healthy' };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      checks.cache = { status: 'unhealthy', error: err };
      if (status === 'healthy') status = 'degraded';
    }
  } else {
    checks.cache = 'not_configured';
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY.trim(),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      });
      checks.anthropic = response.ok ? { status: 'healthy' } : { status: 'unhealthy', error: `HTTP ${response.status}` };
      // Anthropic check is informational — don't affect overall status (key may lack Models API access)
      // if (!response.ok && status === 'healthy') status = 'degraded';
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      checks.anthropic = { status: 'unhealthy', error: err };
      // if (status === 'healthy') status = 'degraded';
    }
  } else {
    checks.anthropic = 'not_configured';
  }

  const allHealthy =
    (typeof checks.database === 'object'
      ? (checks.database as { status: string }).status === 'healthy'
      : checks.database === 'healthy') &&
    (checks.redis === 'not_configured' ||
      (typeof checks.redis === 'object' && (checks.redis as { status: string }).status === 'healthy')) &&
    (checks.cache === 'not_configured' ||
      (typeof checks.cache === 'object' && (checks.cache as { status: string }).status === 'healthy'));
  // Anthropic is informational only — does not affect allHealthy

  const body = {
    status: allHealthy ? 'healthy' : status,
    timestamp: new Date().toISOString(),
    checks,
  };

  return NextResponse.json(body, {
    status: status === 'unhealthy' ? 503 : 200,
  });
}

