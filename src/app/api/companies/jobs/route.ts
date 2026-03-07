/**
 * POST /api/companies/jobs — Create a job for the company (enforces max_active_jobs).
 * Body: { title, company?, location?, url?, jd_raw?, ... }
 * Auth: company_admin or recruiter. Job is created with company_id and is_active: true.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { checkCompanyActiveJobLimit } from '@/lib/plan-limits';
import { logActivity, getClientIp } from '@/lib/activity-log';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const limitCheck = await checkCompanyActiveJobLimit(supabase, companyId);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: 'Active job limit reached',
        limit: limitCheck.max,
        current: limitCheck.current,
        upgradeMessage: 'Upgrade your plan to post more jobs.',
      },
      { status: 429 },
    );
  }

  const companyName = body.company?.trim() || body.company_name?.trim() || 'Company';
  const jdRaw = body.jd_raw?.trim() || body.description?.trim() || '';
  const jdClean = jdRaw.startsWith('<') ? jdRaw.replace(/<[^>]*>/g, ' ').trim() : jdRaw;
  const dedupeHash = crypto
    .createHash('sha256')
    .update([title, companyName, body.location || '', jdClean.slice(0, 500)].map(s => (s || '').toLowerCase().trim()).join('|'))
    .digest('hex');

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      source: 'company',
      title,
      company: companyName,
      location: body.location?.trim() || null,
      url: body.url?.trim() || null,
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
}
