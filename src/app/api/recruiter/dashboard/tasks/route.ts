/**
 * GET /api/recruiter/dashboard/tasks — Daily task list (raw or AI-prioritized).
 * Query: prioritize=ai to trigger AI prioritization (uses ANTHROPIC_API_KEY).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import type { DailyTask } from '@/types/recruiter-dashboard';

export const dynamic = 'force-dynamic';

function buildRawTasks(
  unreviewed: { id: string; candidate?: { full_name?: string } | null; job?: { title?: string } | null }[],
  interviewsToSchedule: { id: string; candidate?: { full_name?: string } | null; job?: { title?: string } | null }[],
  offersToSend: { id: string; candidate?: { full_name?: string } | null; job?: { title?: string } | null }[],
  followUps: { id: string; remind_at: string; application_id?: string }[]
): DailyTask[] {
  const tasks: DailyTask[] = [];
  unreviewed.slice(0, 5).forEach((a, i) => {
    tasks.push({
      id: `screen-${a.id}`,
      type: 'screen_resume',
      title: 'Screen application',
      description: `Review ${(a.candidate && !Array.isArray(a.candidate) ? (a.candidate as { full_name?: string }).full_name : 'Candidate')} for ${(a.job && !Array.isArray(a.job) ? (a.job as { title?: string }).title : 'role')}`,
      related_application_id: a.id,
      related_candidate_name: a.candidate && !Array.isArray(a.candidate) ? (a.candidate as { full_name?: string }).full_name : undefined,
      related_job_title: a.job && !Array.isArray(a.job) ? (a.job as { title?: string }).title : undefined,
      priority_score: 80 - i * 5,
      estimated_time_minutes: 10,
      ai_reasoning: 'New application awaiting review',
    });
  });
  interviewsToSchedule.slice(0, 3).forEach((a, i) => {
    tasks.push({
      id: `schedule-${a.id}`,
      type: 'schedule_interview',
      title: 'Schedule interview',
      description: `Schedule interview for ${(a.candidate && !Array.isArray(a.candidate) ? (a.candidate as { full_name?: string }).full_name : 'candidate')} - ${(a.job && !Array.isArray(a.job) ? (a.job as { title?: string }).title : 'role')}`,
      related_application_id: a.id,
      related_candidate_name: a.candidate && !Array.isArray(a.candidate) ? (a.candidate as { full_name?: string }).full_name : undefined,
      related_job_title: a.job && !Array.isArray(a.job) ? (a.job as { title?: string }).title : undefined,
      priority_score: 85 - i * 5,
      estimated_time_minutes: 5,
      ai_reasoning: 'Candidate in interview stage',
    });
  });
  offersToSend.slice(0, 3).forEach((a, i) => {
    tasks.push({
      id: `offer-${a.id}`,
      type: 'send_offer',
      title: 'Send offer',
      description: `Send offer to ${(a.candidate && !Array.isArray(a.candidate) ? (a.candidate as { full_name?: string }).full_name : 'candidate')} for ${(a.job && !Array.isArray(a.job) ? (a.job as { title?: string }).title : 'role')}`,
      related_application_id: a.id,
      related_candidate_name: a.candidate && !Array.isArray(a.candidate) ? (a.candidate as { full_name?: string }).full_name : undefined,
      related_job_title: a.job && !Array.isArray(a.job) ? (a.job as { title?: string }).title : undefined,
      priority_score: 90 - i * 3,
      estimated_time_minutes: 15,
      ai_reasoning: 'Offer stage - time sensitive',
    });
  });
  followUps.slice(0, 5).forEach((r, i) => {
    tasks.push({
      id: `followup-${r.id}`,
      type: 'follow_up',
      title: 'Follow up',
      description: 'Follow-up reminder due',
      related_application_id: r.application_id,
      priority_score: 70 - i * 5,
      estimated_time_minutes: 5,
      due_date: r.remind_at,
      ai_reasoning: 'Scheduled follow-up',
    });
  });
  return tasks.slice(0, 15);
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const useAi = searchParams.get('prioritize') === 'ai';

    const supabase = createServiceClient();
    const { data: companyJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);
    if (jobIds.length === 0)
      return NextResponse.json({ tasks: [] });

    const { data: companyApplications } = await supabase
      .from('applications')
      .select('id')
      .in('job_id', jobIds);
    const applicationIds = (companyApplications ?? []).map((a: { id: string }) => a.id);

    const followUpsQuery = applicationIds.length > 0
      ? supabase
          .from('application_reminders')
          .select('id, remind_at, application_id')
          .in('application_id', applicationIds)
          .lte('remind_at', new Date().toISOString())
          .eq('is_sent', false)
          .order('remind_at', { ascending: true })
          .limit(10)
      : Promise.resolve({ data: [] as { id: string; remind_at: string; application_id?: string }[] });

    const [
      { data: unreviewed },
      { data: interviewsToSchedule },
      { data: offersToSend },
      { data: followUps },
    ] = await Promise.all([
      supabase
        .from('applications')
        .select('id, candidate:candidates(full_name), job:jobs(title)')
        .in('job_id', jobIds)
        .in('status', ['applied', 'screening'])
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('applications')
        .select('id, candidate:candidates(full_name), job:jobs(title)')
        .in('job_id', jobIds)
        .eq('status', 'interview')
        .limit(5),
      supabase
        .from('applications')
        .select('id, candidate:candidates(full_name), job:jobs(title)')
        .in('job_id', jobIds)
        .eq('status', 'offer')
        .limit(5),
      followUpsQuery,
    ]);

    let tasks = buildRawTasks(
      (unreviewed ?? []) as { id: string; candidate?: { full_name?: string } | null; job?: { title?: string } | null }[],
      (interviewsToSchedule ?? []) as { id: string; candidate?: { full_name?: string } | null; job?: { title?: string } | null }[],
      (offersToSend ?? []) as { id: string; candidate?: { full_name?: string } | null; job?: { title?: string } | null }[],
      (followUps ?? []) as { id: string; remind_at: string; application_id?: string }[]
    );

    if (useAi && tasks.length > 0 && process.env.ANTHROPIC_API_KEY) {
      try {
        const base = req.nextUrl?.origin ?? '';
        const res = await fetch(`${base}/api/recruiter/dashboard/prioritize-tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
          body: JSON.stringify({ tasks }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.tasks)) tasks = data.tasks;
        }
      } catch {
        // keep raw order on AI failure
      }
    }

    return NextResponse.json({ tasks });
  } catch (e) {
    return handleAPIError(e);
  }
}
