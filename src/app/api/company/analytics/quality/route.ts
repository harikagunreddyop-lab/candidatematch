/**
 * GET /api/company/analytics/quality
 * Quality-of-hire evaluations and average composite score.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: evaluations } = await supabase
    .from('hire_quality_evaluations')
    .select('id, application_id, hire_date, manager_rating, performance_rating, culture_fit_rating, retention_90_days, composite_score, evaluated_at')
    .eq('company_id', companyId)
    .order('evaluated_at', { ascending: false })
    .limit(100);

  const list = evaluations ?? [];
  const scores = list
    .map((r: { composite_score?: number }) => r.composite_score)
    .filter((n: number | undefined): n is number => typeof n === 'number');
  const avg_score = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;

  return NextResponse.json({
    evaluations: list,
    average_score: avg_score,
    total_evaluations: list.length,
  });
}
