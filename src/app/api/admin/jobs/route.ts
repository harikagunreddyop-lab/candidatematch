import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { logAuditServer } from '@/lib/audit';
import { apiLogger } from '@/lib/logger';
import { runMatchingForJobs } from '@/lib/matching';
import { z } from 'zod';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Server-side jobs fetch for admin. Bypasses browser caching and returns fresh data.
 */
export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10));
  const pageSize = Math.min(50, Math.max(5, parseInt(searchParams.get('pageSize') ?? '10', 10)));
  const source = searchParams.get('source') ?? 'all';
  const q = (searchParams.get('q') ?? '').trim();

  const supabase = createServiceClient();

  let listQ = supabase
    .from('jobs')
    .select('id,title,company,location,source,scraped_at,url,salary_min,salary_max,job_type,remote_type,jd_clean')
    .order('scraped_at', { ascending: false })
    .order('id', { ascending: false });

  let countQ = supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true });

  if (source !== 'all') {
    listQ = listQ.eq('source', source);
    countQ = countQ.eq('source', source);
  }

  if (q) {
    listQ = listQ.or(`title.ilike.%${q}%,company.ilike.%${q}%`);
    countQ = countQ.or(`title.ilike.%${q}%,company.ilike.%${q}%`);
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const [listRes, countRes] = await Promise.all([
    listQ.range(from, to),
    countQ,
  ]);

  if (listRes.error || countRes.error) {
    const message = listRes.error?.message || countRes.error?.message || 'Failed to load jobs';
    apiLogger.error(
      {
        route: '/api/admin/jobs',
        user_id: auth.user.id,
        source,
        q,
        page,
        pageSize,
      },
      `admin jobs GET failed: ${message}`,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }

  apiLogger.info(
    {
      route: '/api/admin/jobs',
      user_id: auth.user.id,
      source,
      q,
      page,
      pageSize,
      total: countRes.count ?? 0,
      duration_ms: Date.now() - startedAt,
    },
    'admin jobs GET',
  );

  return NextResponse.json({
    jobs: listRes.data ?? [],
    totalCount: countRes.count ?? 0,
    page,
    pageSize,
  });
}

const createManualJobSchema = z.object({
  title: z.string().trim().min(2).max(200),
  company: z.string().trim().min(2).max(160),
  location: z.string().trim().max(160).optional().default(''),
  url: z.string().trim().url().max(500).optional().or(z.literal('')).default(''),
  jd_clean: z.string().trim().max(50000).optional().default(''),
});

function makeManualDedupeHash(input: { title: string; company: string; location: string; jd_clean: string }) {
  return crypto
    .createHash('sha256')
    .update(
      [input.title, input.company, input.location, (input.jd_clean || '').slice(0, 500)]
        .map((s) => (s || '').toLowerCase().trim())
        .join('|'),
    )
    .digest('hex');
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createManualJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid job payload',
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const dedupeHash = makeManualDedupeHash(payload);
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('jobs')
    .select('id')
    .eq('dedupe_hash', dedupeHash)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ error: 'Duplicate job detected for title/company/location' }, { status: 409 });
  }

  const insertPayload = {
    title: payload.title,
    company: payload.company,
    location: payload.location || null,
    url: payload.url || null,
    jd_clean: payload.jd_clean || null,
    jd_raw: payload.jd_clean || null,
    source: 'manual',
    is_active: true,
    dedupe_hash: dedupeHash,
    scraped_at: new Date().toISOString(),
  };

  const { data: createdJob, error } = await supabase
    .from('jobs')
    .insert(insertPayload)
    .select('id,title,company,location,url,source,scraped_at')
    .single();

  if (error) {
    apiLogger.error(
      { route: '/api/admin/jobs', user_id: auth.user.id, err: error.message },
      'admin jobs POST failed',
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await logAuditServer(supabase as never, {
      actor_id: auth.user.id,
      actor_role: auth.profile.effective_role,
    }, {
      action: 'job.create',
      resourceType: 'jobs',
      resourceId: createdJob.id,
      details: {
        source: 'manual',
        title: createdJob.title,
        company: createdJob.company,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    apiLogger.warn({ route: '/api/admin/jobs', user_id: auth.user.id, err: message }, 'audit log failed for manual job');
  }

  let matching: {
    status: 'done' | 'error';
    candidates_processed?: number;
    total_matches_upserted?: number;
    message?: string;
  } = { status: 'done', candidates_processed: 0, total_matches_upserted: 0 };

  try {
    const matchResult = await runMatchingForJobs([createdJob.id]);
    matching = {
      status: 'done',
      candidates_processed: matchResult.candidates_processed,
      total_matches_upserted: matchResult.total_matches_upserted,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    apiLogger.warn(
      { route: '/api/admin/jobs', user_id: auth.user.id, job_id: createdJob.id, err: message },
      'matching failed after manual job creation',
    );
    matching = { status: 'error', message };
  }

  return NextResponse.json({ job: createdJob, matching }, { status: 201 });
}
