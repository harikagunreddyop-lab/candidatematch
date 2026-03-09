/**
 * GET /api/company/analytics/metrics
 * Dashboard KPIs for company hiring (active jobs, applications, funnel counts, time-to-hire, quality).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { getDashboardMetrics } from '@/lib/company-analytics';

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
  const metrics = await getDashboardMetrics(supabase, companyId);
  return NextResponse.json(metrics);
}
