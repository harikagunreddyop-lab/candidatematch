/**
 * GET /api/company/analytics/predictive
 * Predictive hiring insights (time-to-fill, pipeline health, recommendations).
 * Uses historical data; AI enhancement can be wired later.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { getTimeToHire, getHiringFunnel, getPeriodRange } from '@/lib/company-analytics';

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
  const range = getPeriodRange('90d');
  const [timeToHire, funnel] = await Promise.all([
    getTimeToHire(supabase, companyId, range),
    getHiringFunnel(supabase, companyId, range),
  ]);

  const { data: openJobs } = await supabase
    .from('jobs')
    .select('id, title, department, created_at')
    .eq('company_id', companyId)
    .eq('is_active', true);

  const avgDays = timeToHire.avg_days || 0;
  const time_to_fill_prediction = (openJobs ?? []).map((job: { id: string; title: string }) => ({
    job_id: job.id,
    job_title: job.title,
    predicted_days: Math.round(avgDays) || 30,
    confidence: 0.7,
    factors: ['Historical company average', 'Role type'],
  }));

  const applicationsStage = funnel.find((s) => s.stage === 'Applications');
  const interviewStage = funnel.find((s) => s.stage === 'Interview');
  const pipeline_health =
    applicationsStage && applicationsStage.count > 0
      ? Math.min(100, (interviewStage?.count ?? 0) / applicationsStage.count * 100 * 2)
      : 0;

  const recommendations: string[] = [];
  if (timeToHire.avg_days > 45) recommendations.push('Consider broadening sourcing channels to reduce time-to-hire.');
  if (pipeline_health < 20 && (applicationsStage?.count ?? 0) > 0) recommendations.push('Pipeline conversion to interview is low; review screening criteria.');
  if (openJobs && openJobs.length > 5) recommendations.push('Multiple open roles; prioritize roles with most applications.');

  return NextResponse.json({
    time_to_fill_prediction,
    pipeline_health: Math.round(pipeline_health),
    hiring_needs_forecast: [],
    recommendations,
    dateRange: range,
  });
}
