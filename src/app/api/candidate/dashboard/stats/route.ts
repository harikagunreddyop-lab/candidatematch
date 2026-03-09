/**
 * GET /api/candidate/dashboard/stats
 * Aggregated metrics for candidate dashboard.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { profileCompletionPercent } from '@/lib/profile-completion';

export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['candidate', 'platform_admin', 'company_admin', 'recruiter'] });
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();
  const userId = authResult.user.id;

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, full_name, email, primary_title, summary, skills, experience, education, location')
    .eq('user_id', userId)
    .single();

  if (!candidate) {
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
    supabase
      .from('candidate_job_matches')
      .select('id, fit_score, ats_score')
      .eq('candidate_id', candidateId),
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
