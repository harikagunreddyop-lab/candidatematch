/**
 * GET /api/company/team/metrics — Recruiter metrics for company (optional: recruiter_id, period).
 * Query: period=weekly|monthly|quarterly, recruiter_id=uuid.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

function getPeriodDates(period: 'weekly' | 'monthly' | 'quarterly') {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  if (period === 'weekly') {
    start.setDate(start.getDate() - 7);
  } else if (period === 'monthly') {
    start.setMonth(start.getMonth() - 1);
  } else {
    start.setMonth(start.getMonth() - 3);
  }
  start.setHours(0, 0, 0, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || 'monthly') as 'weekly' | 'monthly' | 'quarterly';
    const recruiterId = searchParams.get('recruiter_id') || undefined;
    if (!['weekly', 'monthly', 'quarterly'].includes(period))
      return NextResponse.json({ error: 'period must be weekly, monthly, or quarterly' }, { status: 400 });

    const { start, end } = getPeriodDates(period);
    const supabase = createServiceClient();

    let q = supabase
      .from('recruiter_period_metrics')
      .select('*')
      .eq('company_id', companyId)
      .eq('metric_period', period)
      .gte('period_start', start)
      .lte('period_end', end);

    if (recruiterId) q = q.eq('recruiter_id', recruiterId);

    const { data, error } = await q.order('period_start', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ metrics: data ?? [], period, period_start: start, period_end: end });
  } catch (e) {
    return handleAPIError(e);
  }
}
