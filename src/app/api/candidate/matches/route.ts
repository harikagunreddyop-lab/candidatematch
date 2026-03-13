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
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'matches-mismatch-1',hypothesisId:'H4',location:'api/candidate/matches/route.ts:38',message:'Candidate matches API no candidate linked',data:{userIdPresent:Boolean(userId)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json({
      matches: [],
      limitReached: false,
      usedThisWeek: 0,
      limit: FREE_TIER_WEEKLY_MATCH_LIMIT,
      reset_at: getWeeklyMatchResetAt(),
    });
  }

  const subscriptionTier = (profile?.subscription_tier ?? 'free') as 'free' | 'pro' | 'pro_plus' | 'enterprise';
  const isPro =
    subscriptionTier === 'pro' ||
    subscriptionTier === 'pro_plus' ||
    subscriptionTier === 'enterprise';

  if (isPro) {
    const { data: matches } = await supabase
      .from('candidate_job_matches')
      .select('*, job:jobs(id, title, company, location, remote_type, scraped_at, created_at, is_active)')
      .eq('candidate_id', candidate.id)
      .or('job.is_active.is.null,job.is_active.is.true')
      .order('matched_at', { ascending: false })
      .order('fit_score', { ascending: false });
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'matches-mismatch-1',hypothesisId:'H3',location:'api/candidate/matches/route.ts:58',message:'Candidate matches API pro response',data:{candidateId:candidate.id,tier:subscriptionTier,returnedCount:(matches??[]).length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json({
      matches: matches ?? [],
      limitReached: false,
      usedThisWeek: (matches ?? []).length,
      limit: -1,
      reset_at: null,
    });
  }

  // Free tier: current week only, capped at FREE_TIER_WEEKLY_MATCH_LIMIT (~10/day)
  const weekStart = getWeekStartUtc(new Date());
  const usedThisWeek = await getWeeklyMatchCount(supabase, candidate.id);
  if (usedThisWeek >= FREE_TIER_WEEKLY_MATCH_LIMIT) {
    const { data: capped } = await supabase
      .from('candidate_job_matches')
      .select('*, job:jobs(id, title, company, location, remote_type, scraped_at, created_at, is_active)')
      .eq('candidate_id', candidate.id)
      .gte('matched_at', weekStart)
      .or('job.is_active.is.null,job.is_active.is.true')
      .order('matched_at', { ascending: false })
      .order('fit_score', { ascending: false })
      .limit(FREE_TIER_WEEKLY_MATCH_LIMIT);
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'matches-mismatch-1',hypothesisId:'H3',location:'api/candidate/matches/route.ts:79',message:'Candidate matches API free limit reached',data:{candidateId:candidate.id,usedThisWeek,limit:FREE_TIER_WEEKLY_MATCH_LIMIT,returnedCount:(capped??[]).length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
    .select('*, job:jobs(id, title, company, location, remote_type, scraped_at, created_at, is_active)')
    .eq('candidate_id', candidate.id)
    .gte('matched_at', weekStart)
    .or('job.is_active.is.null,job.is_active.is.true')
    .order('matched_at', { ascending: false })
    .order('fit_score', { ascending: false })
    .limit(FREE_TIER_WEEKLY_MATCH_LIMIT);
  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'matches-mismatch-1',hypothesisId:'H3',location:'api/candidate/matches/route.ts:98',message:'Candidate matches API free response',data:{candidateId:candidate.id,usedThisWeek,limit:FREE_TIER_WEEKLY_MATCH_LIMIT,returnedCount:(matches??[]).length,weekStart},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  return NextResponse.json({
    matches: matches ?? [],
    limitReached: false,
    usedThisWeek: (matches ?? []).length,
    limit: FREE_TIER_WEEKLY_MATCH_LIMIT,
    reset_at: getWeeklyMatchResetAt(),
  });
}
