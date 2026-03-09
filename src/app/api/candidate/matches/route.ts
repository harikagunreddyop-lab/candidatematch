/**
 * GET /api/candidate/matches — Returns job matches for the authenticated candidate.
 * For free tier: capped at 10 matches per week (by matched_at). Pro: unlimited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import {
  getWeeklyMatchCount,
  getWeeklyMatchResetAt,
  FREE_TIER_WEEKLY_MATCH_LIMIT,
} from '@/lib/usage-limits';

export const dynamic = 'force-dynamic';

function getWeekStartUtc(now: Date): string {
  const d = new Date(now);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['candidate', 'platform_admin', 'company_admin', 'recruiter'] });
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();
  const userId = authResult.user.id;

  const [{ data: profile }, { data: candidate }] = await Promise.all([
    supabase.from('profiles').select('subscription_tier').eq('id', userId).single(),
    supabase.from('candidates').select('id').eq('user_id', userId).single(),
  ]);

  if (!candidate) {
    return NextResponse.json({
      matches: [],
      limitReached: false,
      usedThisWeek: 0,
      limit: FREE_TIER_WEEKLY_MATCH_LIMIT,
      reset_at: getWeeklyMatchResetAt(),
    });
  }

  const subscriptionTier = profile?.subscription_tier ?? 'free';
  const isPro = subscriptionTier === 'pro';

  if (isPro) {
    const { data: matches } = await supabase
      .from('candidate_job_matches')
      .select('*, job:jobs(id, title, company, location, remote_type, scraped_at, created_at)')
      .eq('candidate_id', candidate.id)
      .order('fit_score', { ascending: false });
    return NextResponse.json({
      matches: matches ?? [],
      limitReached: false,
      usedThisWeek: (matches ?? []).length,
      limit: -1,
      reset_at: null,
    });
  }

  // Free tier: current week only, cap at 10
  const weekStart = getWeekStartUtc(new Date());
  const usedThisWeek = await getWeeklyMatchCount(supabase, candidate.id);
  if (usedThisWeek >= FREE_TIER_WEEKLY_MATCH_LIMIT) {
    const { data: capped } = await supabase
      .from('candidate_job_matches')
      .select('*, job:jobs(id, title, company, location, remote_type, scraped_at, created_at)')
      .eq('candidate_id', candidate.id)
      .gte('matched_at', weekStart)
      .order('fit_score', { ascending: false })
      .limit(FREE_TIER_WEEKLY_MATCH_LIMIT);
    return NextResponse.json({
      matches: capped ?? [],
      limitReached: true,
      usedThisWeek: FREE_TIER_WEEKLY_MATCH_LIMIT,
      limit: FREE_TIER_WEEKLY_MATCH_LIMIT,
      reset_at: getWeeklyMatchResetAt(),
      upgradeMessage: 'Upgrade to Pro for unlimited matches.',
    });
  }

  const { data: matches } = await supabase
    .from('candidate_job_matches')
    .select('*, job:jobs(id, title, company, location, remote_type, scraped_at, created_at)')
    .eq('candidate_id', candidate.id)
    .gte('matched_at', weekStart)
    .order('fit_score', { ascending: false })
    .limit(FREE_TIER_WEEKLY_MATCH_LIMIT);

  return NextResponse.json({
    matches: matches ?? [],
    limitReached: false,
    usedThisWeek: (matches ?? []).length,
    limit: FREE_TIER_WEEKLY_MATCH_LIMIT,
    reset_at: getWeeklyMatchResetAt(),
  });
}
