/**
 * GET /api/recruiter/dashboard/upcoming-interviews — Upcoming interviews for company jobs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import type { UpcomingInterview } from '@/types/recruiter-dashboard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const supabase = createServiceClient();
    const { data: companyJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);
    if (jobIds.length === 0)
      return NextResponse.json({ interviews: [] });

    const { data: rows } = await supabase
      .from('interviews')
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        interview_type,
        application_id,
        candidate_id,
        job_id,
        candidate:candidates(full_name),
        job:jobs(title)
      `)
      .in('job_id', jobIds)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20);

    const interviews: UpcomingInterview[] = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      scheduled_at: r.scheduled_at as string,
      duration_minutes: (r.duration_minutes as number) ?? 60,
      candidate_name:
        (r.candidate as { full_name?: string })?.full_name ?? 'Candidate',
      job_title: (r.job as { title?: string })?.title ?? 'Role',
      interview_type: r.interview_type as string | undefined,
      application_id: r.application_id as string | undefined,
      candidate_id: r.candidate_id as string,
      job_id: r.job_id as string,
    }));
    return NextResponse.json({ interviews });
  } catch (e) {
    return handleAPIError(e);
  }
}
