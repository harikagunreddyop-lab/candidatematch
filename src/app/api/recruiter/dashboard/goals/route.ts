/**
 * GET /api/recruiter/dashboard/goals — My goals and progress (team_goals + current metrics).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import type { RecruiterGoals } from '@/types/recruiter-dashboard';

export const dynamic = 'force-dynamic';

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    const profileId = authResult.profile.id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const supabase = createServiceClient();
    const now = new Date();
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);

    const { data: goals } = await supabase
      .from('team_goals')
      .select('*')
      .eq('company_id', companyId)
      .or(`assignee_id.eq.${profileId},assignee_id.is.null`)
      .lte('period_start', weekEnd.toISOString().slice(0, 10))
      .gte('period_end', weekStart.toISOString().slice(0, 10));

    const { data: companyJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);

    let applicationsThisWeek = 0;
    let interviewsThisWeek = 0;
    let offersThisWeek = 0;
    let hiresThisMonth = 0;
    if (jobIds.length > 0) {
      const [apps, interviews, offers, hires] = await Promise.all([
        supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .in('job_id', jobIds)
          .gte('created_at', weekStart.toISOString())
          .lte('created_at', weekEnd.toISOString()),
        supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .in('job_id', jobIds)
          .eq('status', 'interview')
          .gte('updated_at', weekStart.toISOString())
          .lte('updated_at', weekEnd.toISOString()),
        supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .in('job_id', jobIds)
          .eq('status', 'offer')
          .gte('updated_at', weekStart.toISOString())
          .lte('updated_at', weekEnd.toISOString()),
        supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .in('job_id', jobIds)
          .eq('status', 'hired')
          .gte('updated_at', monthStart.toISOString())
          .lte('updated_at', monthEnd.toISOString()),
      ]);
      applicationsThisWeek = apps.count ?? 0;
      interviewsThisWeek = interviews.count ?? 0;
      offersThisWeek = offers.count ?? 0;
      hiresThisMonth = hires.count ?? 0;
    }

    const goalMap = (goals ?? []).reduce(
      (acc: Record<string, { target: number; current: number }>, g: { goal_type: string; target_value: number; current_value: number }) => {
        const key = g.goal_type;
        if (!acc[key]) acc[key] = { target: g.target_value, current: g.current_value };
        return acc;
      },
      {} as Record<string, { target: number; current: number }>
    );

    const applicationsTarget = goalMap.applications?.target ?? 10;
    const interviewsTarget = goalMap.interviews?.target ?? 5;
    const offersTarget = goalMap.offers?.target ?? 2;
    const hiresTarget = goalMap.hires?.target ?? 1;
    const qualityTarget = goalMap.quality_score?.target ?? 80;

    const progressApplications = applicationsTarget ? Math.min(100, (applicationsThisWeek / applicationsTarget) * 100) : 0;
    const progressInterviews = interviewsTarget ? Math.min(100, (interviewsThisWeek / interviewsTarget) * 100) : 0;
    const progressOffers = offersTarget ? Math.min(100, (offersThisWeek / offersTarget) * 100) : 0;
    const progressThisWeek =
      (progressApplications + progressInterviews + progressOffers) / 3;
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const expectedProgress = (dayOfWeek / 7) * 100;
    const on_track = progressThisWeek >= expectedProgress - 15;

    const result: RecruiterGoals = {
      weekly_goals: {
        applications: { target: applicationsTarget, current: applicationsThisWeek },
        interviews: { target: interviewsTarget, current: interviewsThisWeek },
        offers: { target: offersTarget, current: offersThisWeek },
      },
      monthly_goals: {
        hires: { target: hiresTarget, current: hiresThisMonth },
        quality_score: { target: qualityTarget, current: qualityTarget },
      },
      progress_this_week: Math.round(progressThisWeek),
      on_track,
      motivational_message: on_track
        ? "You're on track for the week. Keep it up!"
        : "A few more actions this week will get you back on track.",
    };
    return NextResponse.json(result);
  } catch (e) {
    return handleAPIError(e);
  }
}
