/**
 * POST /api/company/applications/[id]/quality-evaluation
 * Submit a 90-day quality-of-hire evaluation for an application (hire).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

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
  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 });
  }

  const { id: applicationId } = await params;
  const body = await req.json().catch(() => ({}));
  const manager_rating = typeof body.manager_rating === 'number' ? body.manager_rating : undefined;
  const performance_rating = typeof body.performance_rating === 'number' ? body.performance_rating : undefined;
  const culture_fit_rating = typeof body.culture_fit_rating === 'number' ? body.culture_fit_rating : undefined;
  const retention_90_days = typeof body.retention_90_days === 'boolean' ? body.retention_90_days : undefined;
  const notes = typeof body.notes === 'string' ? body.notes : undefined;

  const supabase = createServiceClient();
  const { data: app } = await supabase
    .from('applications')
    .select('id, job_id, status, updated_at')
    .eq('id', applicationId)
    .single();

  if (!app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('company_id')
    .eq('id', app.job_id)
    .single();

  if (!job || (job as { company_id: string }).company_id !== companyId) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  if (app.status !== 'offer') {
    return NextResponse.json({ error: 'Application is not a hire' }, { status: 400 });
  }

  const weights = { manager_rating: 0.3, performance_rating: 0.3, culture_fit_rating: 0.2, retention: 0.2 };
  const composite_score = Math.round(
    ((Math.min(10, Math.max(1, manager_rating ?? 0)) / 10) * weights.manager_rating +
      (Math.min(10, Math.max(1, performance_rating ?? 0)) / 10) * weights.performance_rating +
      (Math.min(10, Math.max(1, culture_fit_rating ?? 0)) / 10) * weights.culture_fit_rating +
      (retention_90_days ? 1 : 0) * weights.retention) *
      100
  );

  const hire_date = app.updated_at.slice(0, 10);

  const { data: inserted, error } = await supabase
    .from('hire_quality_evaluations')
    .upsert(
      {
        company_id: companyId,
        application_id: applicationId,
        hire_date,
        manager_rating,
        performance_rating,
        culture_fit_rating,
        retention_90_days,
        composite_score,
        notes,
      },
      { onConflict: 'application_id' }
    )
    .select('id, composite_score')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, evaluation: inserted });
}
