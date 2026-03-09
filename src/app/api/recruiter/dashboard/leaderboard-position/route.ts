/**
 * GET /api/recruiter/dashboard/leaderboard-position — My rank in company leaderboard.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import type { LeaderboardPosition } from '@/types/recruiter-dashboard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const profileId = authResult.profile.id;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || 'monthly') as 'weekly' | 'monthly';

    const base = req.nextUrl?.origin ?? '';
    const res = await fetch(
      `${base}/api/company/team/leaderboard?period=${period}`,
      { headers: { Cookie: req.headers.get('cookie') ?? '' } }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(err, { status: res.status });
    }
    const data = await res.json();
    const rankings = data.rankings ?? [];
    const me = rankings.find((r: { recruiter_id: string }) => r.recruiter_id === profileId);
    if (!me) {
      return NextResponse.json({
        rank: 0,
        total_recruiters: rankings.length,
        period: data.period,
        period_start: data.period_start,
        period_end: data.period_end,
        score: 0,
        metrics: { hires: 0, offers: 0, interviews: 0, applications: 0 },
        badges: [],
      } satisfies LeaderboardPosition);
    }
    const position: LeaderboardPosition = {
      rank: me.rank,
      total_recruiters: rankings.length,
      period: data.period,
      period_start: data.period_start,
      period_end: data.period_end,
      score: me.score,
      metrics: me.metrics ?? { hires: 0, offers: 0, interviews: 0, applications: 0 },
      badges: me.badges ?? [],
    };
    return NextResponse.json(position);
  } catch (e) {
    return handleAPIError(e);
  }
}
