/**
 * GET /api/company/analytics/funnel?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Hiring funnel stages with counts and drop rates.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { getHiringFunnel, getPeriodRange } from '@/lib/company-analytics';

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

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const period = searchParams.get('period') as '7d' | '30d' | '90d' | null;
  const dateRange =
    start && end
      ? { startDate: start, endDate: end }
      : period && ['7d', '30d', '90d'].includes(period)
        ? getPeriodRange(period)
        : getPeriodRange('30d');

  const supabase = createServiceClient();
  const funnel = await getHiringFunnel(supabase, companyId, dateRange);
  return NextResponse.json({ funnel, dateRange });
}
