import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { cached } from '@/lib/redis-upstash';
import { checkRateLimit, ipRateLimit } from '@/lib/ratelimit-upstash';

export const runtime = 'edge';

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anonymous'
  );
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, ipRateLimit);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': String(rl.remaining),
          'X-RateLimit-Reset': String(rl.reset),
        },
      }
    );
  }

  const { searchParams } = new URL(req.url);
  const skill = searchParams.get('skill');
  const region = searchParams.get('region');
  const cacheKey = `market:jobs:${skill ?? ''}:${region ?? ''}`;

  const result = await cached(cacheKey, 300, async () => {
    const supabase = createServiceClient();
    let q = supabase
      .from('jobs')
      .select('id, title, company, location, job_metadata')
      .eq('is_active', true)
      .limit(100);

    if (skill) {
      q = q.contains('job_metadata', { skills: [skill] });
    }
    if (region) {
      q = q.eq('location', region);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { results: data || [] };
  });

  return NextResponse.json(result);
}

