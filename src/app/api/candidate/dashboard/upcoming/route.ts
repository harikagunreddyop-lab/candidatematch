/**
 * GET /api/candidate/dashboard/upcoming
 * Upcoming deadlines and events: interview dates, application follow-up reminders, offer-related deadlines.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type UpcomingItem = {
  id: string;
  type: 'interview' | 'follow_up' | 'reminder' | 'offer_deadline';
  title: string;
  at: string;
  applicationId?: string;
  jobId?: string;
  jobTitle?: string;
  company?: string;
  note?: string;
};

export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['candidate', 'platform_admin', 'company_admin', 'recruiter'] });
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();
  const userId = authResult.user.id;

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (!candidate) {
    return NextResponse.json({ upcoming: [] });
  }

  const candidateId = (candidate as { id: string }).id;
  const now = new Date().toISOString();

  const [applicationsWithInterview, reminders, followUps] = await Promise.all([
    supabase
      .from('applications')
      .select('id, job_id, interview_date, status, offer_details, job:jobs(title, company)')
      .eq('candidate_id', candidateId)
      .gte('interview_date', now)
      .not('interview_date', 'is', null)
      .order('interview_date', { ascending: true })
      .limit(20),
    supabase
      .from('application_reminders')
      .select('id, application_id, remind_at, application:applications(job_id, job:jobs(title, company))')
      .eq('candidate_id', candidateId)
      .gte('remind_at', now)
      .order('remind_at', { ascending: true })
      .limit(20),
    supabase
      .from('follow_up_reminders')
      .select('id, application_id, remind_at, note, application:applications(job_id, job:jobs(title, company))')
      .eq('candidate_id', candidateId)
      .gte('remind_at', now)
      .order('remind_at', { ascending: true })
      .limit(20),
  ]);

  const upcoming: UpcomingItem[] = [];

  for (const a of applicationsWithInterview.data ?? []) {
    const row = a as {
      id: string;
      job_id: string;
      interview_date: string;
      status: string;
      job?: { title?: string; company?: string } | null;
    };
    if (row.interview_date) {
      upcoming.push({
        id: `interview-${row.id}`,
        type: 'interview',
        title: 'Interview',
        at: row.interview_date,
        applicationId: row.id,
        jobId: row.job_id,
        jobTitle: row.job?.title ?? undefined,
        company: row.job?.company ?? undefined,
      });
    }
  }

  for (const r of reminders.data ?? []) {
    const row = r as {
      id: string;
      application_id: string;
      remind_at: string;
      application?: { job_id?: string; job?: { title?: string; company?: string } } | null;
    };
    const app = row.application as { job_id?: string; job?: { title?: string; company?: string } } | undefined;
    upcoming.push({
      id: `reminder-${row.id}`,
      type: 'reminder',
      title: 'Follow-up reminder',
      at: row.remind_at,
      applicationId: row.application_id,
      jobId: app?.job_id,
      jobTitle: app?.job?.title,
      company: app?.job?.company,
    });
  }

  for (const f of followUps.data ?? []) {
    const row = f as {
      id: string;
      application_id: string;
      remind_at: string;
      note?: string;
      application?: { job_id?: string; job?: { title?: string; company?: string } } | null;
    };
    const app = row.application as { job_id?: string; job?: { title?: string; company?: string } } | undefined;
    upcoming.push({
      id: `follow-${row.id}`,
      type: 'follow_up',
      title: 'Follow up',
      at: row.remind_at,
      applicationId: row.application_id,
      jobId: app?.job_id,
      jobTitle: app?.job?.title,
      company: app?.job?.company,
      note: row.note ?? undefined,
    });
  }

  upcoming.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const sliced = upcoming.slice(0, 30);

  return NextResponse.json({ upcoming: sliced });
}
