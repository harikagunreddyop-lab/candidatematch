/**
 * GET /api/candidate/dashboard/stats
 * Aggregated metrics for candidate dashboard.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { profileCompletionPercent } from '@/lib/profile-completion';
import { FREE_TIER_WEEKLY_MATCH_LIMIT } from '@/lib/usage-limits';

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
  const weekStartUtc = getWeekStartUtc(new Date());

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();
  const isPro = (profile?.subscription_tier ?? 'free') === 'pro';

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, full_name, email, primary_title, summary, skills, experience, education, location')
    .eq('user_id', userId)
    .single();

  if (!candidate) {
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'matches-mismatch-1',hypothesisId:'H1',location:'dashboard/stats/route.ts:24',message:'Dashboard stats candidate not found',data:{userIdPresent:Boolean(userId)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json({
      applicationsTotal: 0,
      applicationsByStatus: {},
      activeMatches: 0,
      interviewsUpcoming: 0,
      interviewsPast: 0,
      profileCompletionPercent: 0,
      daysSinceLastApplication: null,
      averageMatchScore: 0,
      applicationsThisWeek: 0,
    });
  }

  const candidateId = candidate.id as string;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - todayStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekStartIso = weekStart.toISOString();

  const matchesQuery = supabase
    .from('candidate_job_matches')
    .select('id, fit_score, ats_score')
    .eq('candidate_id', candidateId)
    .order('fit_score', { ascending: false });

  if (!isPro) {
    matchesQuery.gte('matched_at', weekStartUtc).limit(FREE_TIER_WEEKLY_MATCH_LIMIT);
  }

  const [
    { data: applications },
    { data: matches },
    { data: applicationsWithInterview },
    { data: applicationsThisWeekCount },
  ] = await Promise.all([
    supabase
      .from('applications')
      .select('id, status, applied_at')
      .eq('candidate_id', candidateId),
    matchesQuery,
    supabase
      .from('applications')
      .select('id, interview_date, status')
      .eq('candidate_id', candidateId)
      .in('status', ['screening', 'interview', 'offer'])
      .not('interview_date', 'is', null),
    supabase
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateId)
      .gte('applied_at', weekStartIso),
  ]);

  const apps = applications ?? [];
  type AppRow = { status: string; applied_at: string | null };
  const applicationsByStatus: Record<string, number> = {};
  for (const a of apps as AppRow[]) {
    applicationsByStatus[a.status] = (applicationsByStatus[a.status] ?? 0) + 1;
  }

  let lastAppliedAt: number | null = null;
  for (const a of apps as AppRow[]) {
    const at = a.applied_at;
    if (at) {
      const t = new Date(at).getTime();
      if (!lastAppliedAt || t > lastAppliedAt) lastAppliedAt = t;
    }
  }
  const daysSinceLastApplication =
    lastAppliedAt != null ? Math.floor((todayStart.getTime() - lastAppliedAt) / (24 * 60 * 60 * 1000)) : null;

  const interviews = applicationsWithInterview ?? [];
  type InterviewRow = { interview_date: string | null };
  const interviewDates = (interviews as InterviewRow[])
    .map((a) => a.interview_date)
    .filter(Boolean) as string[];
  const interviewsUpcoming = interviewDates.filter((d) => new Date(d) >= now).length;
  const interviewsPast = interviewDates.filter((d) => new Date(d) < now).length;

  const matchList = matches ?? [];
  type MatchRow = { fit_score?: number; ats_score?: number | null };
  const scoreOf = (m: MatchRow) =>
    typeof m.ats_score === 'number' ? m.ats_score : m.fit_score ?? 0;
  const averageMatchScore =
    matchList.length > 0
      ? Math.round((matchList as MatchRow[]).reduce((sum: number, m: MatchRow) => sum + scoreOf(m), 0) / matchList.length)
      : 0;

  const profileCompletionPercentValue = profileCompletionPercent(candidate as Record<string, unknown>);

  const applicationsThisWeek = (applicationsThisWeekCount ?? []).length;

  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:'f6067c',runId:'candidate-dashboard-post-fix',hypothesisId:'H3',location:'src/app/api/candidate/dashboard/stats/route.ts:136',message:'stats computed with tier-aware match scope',data:{candidateId,isPro,weekStart:!isPro?weekStartUtc:null,activeMatches:matchList.length,averageMatchScore},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  return NextResponse.json({
    applicationsTotal: apps.length,
    applicationsByStatus,
    activeMatches: matchList.length,
    interviewsUpcoming,
    interviewsPast,
    profileCompletionPercent: profileCompletionPercentValue,
    daysSinceLastApplication,
    averageMatchScore,
    applicationsThisWeek,
  });
}
