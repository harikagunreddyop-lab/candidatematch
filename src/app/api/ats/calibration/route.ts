import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin'],
  });
  if (auth instanceof Response) return auth;

  const service = createServiceClient();

  const effectiveRole = auth.profile.effective_role;
  const url = new URL(req.url);
  const companyIdParam = url.searchParams.get('company_id');

  const company_id =
    effectiveRole === 'platform_admin'
      ? companyIdParam ?? auth.profile.company_id
      : auth.profile.company_id;

  if (!company_id) {
    return NextResponse.json(
      { error: 'No company context (provide company_id)' },
      { status: 400 },
    );
  }

  // Pull audit + outcomes for this company's jobs
  const { data: rows, error } = await service
    .from('ats_decision_audit')
    .select(
      'application_id, decision_action, role_fit_score, final_decision_score, job_id, jobs!inner(company_id), outcome:ats_outcome_labels(shortlisted, interviewed, hired, rejected)',
    )
    .eq('jobs.company_id', company_id);

  if (error) {
    return NextResponse.json({ error: 'Failed to load calibration data' }, { status: 500 });
  }

  type OutcomeAgg = { shortlisted: number; hired: number; rejected: number; interviewed: number; total: number };
  const byAction: Record<string, OutcomeAgg> = {};

  const roleFitByOutcome: { hired: number[]; rejected: number[] } = {
    hired: [],
    rejected: [],
  };

  for (const r of rows ?? []) {
    const action = (r as any).decision_action ?? 'unknown';
    const out = (r as any).outcome ?? null;
    const agg = (byAction[action] ??= {
      shortlisted: 0,
      interviewed: 0,
      hired: 0,
      rejected: 0,
      total: 0,
    });
    agg.total += 1;

    if (out?.shortlisted) agg.shortlisted += 1;
    if (out?.interviewed) agg.interviewed += 1;
    if (out?.hired) agg.hired += 1;
    if (out?.rejected) agg.rejected += 1;

    const roleFit = typeof (r as any).role_fit_score === 'number' ? (r as any).role_fit_score : null;
    if (roleFit != null) {
      if (out?.hired) roleFitByOutcome.hired.push(roleFit);
      if (out?.rejected) roleFitByOutcome.rejected.push(roleFit);
    }
  }

  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  return NextResponse.json({
    company_id,
    by_decision_action: byAction,
    avg_role_fit_by_outcome: {
      hired: avg(roleFitByOutcome.hired),
      rejected: avg(roleFitByOutcome.rejected),
    },
  });
}

