/**
 * GET /api/companies/jobs — List jobs for the company (auth user's company or company_id for platform_admin).
 * POST /api/companies/jobs — Create a job for the company (enforces max_active_jobs).
 * Body: { title, company?, location?, url?, jd_raw?, ... }
 * Auth: company_admin or recruiter. Job is created with company_id and is_active: true.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { requireApiKey } from '@/lib/api-keys';
import { createServiceClient } from '@/lib/supabase-server';
import { checkCompanyFeatureAccess } from '@/lib/feature-gates';
import { logActivity, getClientIp } from '@/lib/activity-log';
import { sanitizePlainText, sanitizeRequiredString, sanitizeString } from '@/lib/sanitize';
import { checkRateLimit, strictRateLimit } from '@/lib/ratelimit-upstash';
import { invalidateCache } from '@/lib/redis';
import { captureServerEvent, AnalyticsEvents } from '@/lib/analytics-posthog-server';
import { handleAPIError } from '@/lib/errors';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/** GET — List jobs. Auth: session (company from profile) or x-api-key (company from key). */
export async function GET(req: NextRequest) {
  try {
  let companyId: string | null = null;
  const hasApiKey = !!req.headers.get('x-api-key')?.trim();

  if (hasApiKey) {
    const apiKeyResult = await requireApiKey(req);
    if ('error' in apiKeyResult) return apiKeyResult.error;
    companyId = apiKeyResult.companyId;
  } else {
    const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (auth instanceof Response) return auth;
    companyId =
      auth.profile.effective_role === 'platform_admin'
        ? req.nextUrl.searchParams.get('company_id') || auth.profile.company_id
        : auth.profile.company_id;
  }

  if (!companyId) {
    return NextResponse.json({ jobs: [] });
  }

  const supabase = createServiceClient();
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10)));
  const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10));
  const activeOnly = req.nextUrl.searchParams.get('active_only') !== 'false';

  let q = supabase
    .from('jobs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (activeOnly) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
  } catch (e) {
    return handleAPIError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const postJobAccess = await checkCompanyFeatureAccess(supabase, companyId, 'post_job');
  if (!postJobAccess.allowed) {
    return NextResponse.json(
      {
        error: postJobAccess.reason ?? 'Active job limit reached',
        upgrade_url: postJobAccess.upgrade_url,
        current: postJobAccess.current,
        limit: postJobAccess.limit,
      },
      { status: 403 }
    );
  }

  const rl = await checkRateLimit(`user:${auth.profile.id}:create-job`, strictRateLimit);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before creating another job.' },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const title = sanitizeRequiredString(body.title, 500);
  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }

  const companyName = sanitizeString(body.company || body.company_name, 300) || 'Company';
  const jdRaw = sanitizePlainText(body.jd_raw || body.description, 100_000);
  const jdClean = jdRaw.startsWith('<') ? jdRaw.replace(/<[^>]*>/g, ' ').trim() : jdRaw;
  const locationStr = sanitizeString(body.location, 500);
  const urlStr = sanitizeString(body.url, 2048);
  const dedupeHash = crypto
    .createHash('sha256')
    .update([title, companyName, locationStr, jdClean.slice(0, 500)].map(s => (s || '').toLowerCase().trim()).join('|'))
    .digest('hex');

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      source: 'company',
      title,
      company: companyName,
      location: locationStr || null,
      url: urlStr || null,
      jd_raw: jdRaw || null,
      jd_clean: jdClean || null,
      dedupe_hash: dedupeHash,
      is_active: true,
      company_id: companyId,
      posted_by: auth.profile.id,
      scraped_at: new Date().toISOString(),
    })
    .select('id, title, company, is_active')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await captureServerEvent(auth.user.id, AnalyticsEvents.JOB_CREATED, {
    job_id: job.id,
    company_id: companyId,
    user_id: auth.profile.id,
    title: job.title,
    source: 'company',
  });

  await invalidateCache(`market:jobs:*`);

  await logActivity({
    supabase,
    company_id: companyId,
    user_id: auth.profile.id,
    action: 'job_created',
    resource_type: 'job',
    resource_id: job.id,
    metadata: { title: job.title },
    ip_address: getClientIp(req),
    user_agent: req.headers.get('user-agent') ?? null,
  });

  return NextResponse.json({ job });
  } catch (e) {
    return handleAPIError(e);
  }
}
