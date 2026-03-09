/**
 * GET /api/company/analytics/time-to-hire?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Time-to-hire metrics: avg, median, by role/department, trend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { getTimeToHire, getPeriodRange } from '@/lib/company-analytics';

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
        : getPeriodRange('90d');

  const supabase = createServiceClient();
  const metrics = await getTimeToHire(supabase, companyId, dateRange);
  return NextResponse.json({ ...metrics, dateRange });
}
