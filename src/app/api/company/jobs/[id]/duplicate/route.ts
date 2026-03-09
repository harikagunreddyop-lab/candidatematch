/**
 * POST /api/company/jobs/[id]/duplicate
 * Duplicate an existing job (same title, description; new id, no applications).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { checkCompanyFeatureAccess } from '@/lib/feature-gates';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 400 });

  const { id: sourceJobId } = await params;
  const supabase = createServiceClient();

  const access = await checkCompanyFeatureAccess(supabase, companyId, 'post_job');
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason ?? 'Active job limit reached', upgrade_url: access.upgrade_url },
      { status: 403 }
    );
  }

  const { data: source } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', sourceJobId)
    .eq('company_id', companyId)
    .single();

  if (!source) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const s = source as Record<string, unknown>;
  const dedupeHash = crypto
    .createHash('sha256')
    .update(`dup-${sourceJobId}-${Date.now()}-${Math.random()}`)
    .digest('hex');

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      source: 'company',
      title: s.title,
      company: s.company,
      location: s.location ?? null,
      url: null,
      jd_raw: s.jd_raw ?? null,
      jd_clean: s.jd_clean ?? null,
      dedupe_hash: dedupeHash,
      is_active: false,
      company_id: companyId,
      posted_by: auth.profile.id,
      scraped_at: new Date().toISOString(),
      department: s.department ?? null,
      salary_min: s.salary_min ?? null,
      salary_max: s.salary_max ?? null,
    })
    .select('id, title')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job, message: 'Job duplicated. Edit and activate when ready.' });
}
