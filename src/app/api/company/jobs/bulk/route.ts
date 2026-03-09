/**
 * POST /api/company/jobs/bulk
 * Body: { action: 'pause' | 'archive' | 'delete', job_ids: string[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const job_ids = Array.isArray(body.job_ids) ? body.job_ids.filter((id: unknown) => typeof id === 'string') : [];
  if (!['pause', 'archive', 'delete'].includes(action) || job_ids.length === 0) {
    return NextResponse.json(
      { error: 'action (pause|archive|delete) and non-empty job_ids required' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('company_id', companyId)
    .in('id', job_ids);
  const ids = (jobs ?? []).map((j: { id: string }) => j.id);
  if (ids.length === 0) return NextResponse.json({ updated: 0, message: 'No jobs found' });

  if (action === 'delete') {
    const { error } = await supabase.from('jobs').delete().in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: ids.length, message: `${ids.length} job(s) deleted` });
  }

  const { error } = await supabase
    .from('jobs')
    .update({ is_active: false })
    .in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    updated: ids.length,
    message: action === 'archive' ? `${ids.length} job(s) archived` : `${ids.length} job(s) paused`,
  });
}
