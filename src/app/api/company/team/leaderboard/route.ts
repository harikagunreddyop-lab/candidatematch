/**
 * GET /api/company/team/leaderboard — Leaderboard for company by period.
 * Query: period=weekly|monthly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

function getPeriodDates(period: 'weekly' | 'monthly') {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  if (period === 'weekly') {
    start.setDate(start.getDate() - 7);
  } else {
    start.setMonth(start.getMonth() - 1);
  }
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
    const period = (searchParams.get('period') || 'monthly') as 'weekly' | 'monthly';
    if (!['weekly', 'monthly'].includes(period))
      return NextResponse.json({ error: 'period must be weekly or monthly' }, { status: 400 });

    const { start, end } = getPeriodDates(period);
    const supabase = createServiceClient();

    const { data: metrics, error: metricsErr } = await supabase
      .from('recruiter_period_metrics')
      .select('recruiter_id, hires_completed, offers_extended, interviews_scheduled, applications_submitted')
      .eq('company_id', companyId)
      .eq('metric_period', period)
      .gte('period_start', start)
      .lte('period_end', end);

    if (metricsErr) return NextResponse.json({ error: metricsErr.message }, { status: 500 });

    const byRecruiter = new Map<string, { hires: number; offers: number; interviews: number; applications: number }>();
    for (const m of metrics ?? []) {
      const r = m.recruiter_id as string;
      const cur = byRecruiter.get(r) ?? { hires: 0, offers: 0, interviews: 0, applications: 0 };
      byRecruiter.set(r, {
        hires: cur.hires + (m.hires_completed ?? 0),
        offers: cur.offers + (m.offers_extended ?? 0),
        interviews: cur.interviews + (m.interviews_scheduled ?? 0),
        applications: cur.applications + (m.applications_submitted ?? 0),
      });
    }

    const recruiterIds = [...byRecruiter.keys()];
    if (recruiterIds.length === 0) {
      return NextResponse.json({ period, period_start: start, period_end: end, rankings: [] });
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', recruiterIds);
    const profileMap = new Map((profiles ?? []).map((p: { id: string; name: string | null; email: string | null }) => [p.id, p]));

    const rankings = recruiterIds.map((recruiterId) => {
      const m = byRecruiter.get(recruiterId)!;
      const score =
        m.hires * 100 +
        m.offers * 50 +
        m.interviews * 20 +
        m.applications * 5;
      return {
        recruiter_id: recruiterId,
        recruiter: profileMap.get(recruiterId) ?? { id: recruiterId, name: null, email: null },
        score,
        metrics: m,
        badges: [] as string[],
      };
    });

    rankings.sort((a, b) => b.score - a.score);
    rankings.forEach((r, i) => {
      if (i === 0) r.badges.push('Top Performer');
      if (r.metrics.hires >= 5) r.badges.push('Hiring Champion');
    });

    const result = rankings.map((r, i) => ({
      rank: i + 1,
      ...r,
    }));

    return NextResponse.json({
      period,
      period_start: start,
      period_end: end,
      rankings: result,
    });
  } catch (e) {
    return handleAPIError(e);
  }
}
