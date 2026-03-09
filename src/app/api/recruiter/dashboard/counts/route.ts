/**
 * GET /api/recruiter/dashboard/counts — Quick action counts for the recruiter dashboard.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import type { QuickActionCounts } from '@/types/recruiter-dashboard';

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
    if (jobIds.length === 0) {
      return NextResponse.json({
        counts: {
          unreviewed_applications: 0,
          interviews_to_schedule: 0,
          follow_ups_due: 0,
          pending_offers: 0,
        } satisfies QuickActionCounts,
      });
    }

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      { count: unreviewedCount },
      { count: interviewsToScheduleCount },
      { count: pendingOffersCount },
    ] = await Promise.all([
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .in('job_id', jobIds)
        .in('status', ['applied', 'screening']),
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .in('job_id', jobIds)
        .eq('status', 'interview'),
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .in('job_id', jobIds)
        .eq('status', 'offer'),
    ]);

    const { data: companyApplications } = await supabase
      .from('applications')
      .select('id')
      .in('job_id', jobIds);
    const applicationIds = (companyApplications ?? []).map((a: { id: string }) => a.id);

    let followUpsDueCount = 0;
    if (applicationIds.length > 0) {
      const { count } = await supabase
        .from('application_reminders')
        .select('id', { count: 'exact', head: true })
        .in('application_id', applicationIds)
        .lte('remind_at', todayEnd.toISOString())
        .eq('is_sent', false);
      followUpsDueCount = count ?? 0;
    }

    const counts: QuickActionCounts = {
      unreviewed_applications: unreviewedCount ?? 0,
      interviews_to_schedule: interviewsToScheduleCount ?? 0,
      follow_ups_due: followUpsDueCount,
      pending_offers: pendingOffersCount ?? 0,
    };

    return NextResponse.json({ counts });
  } catch (e) {
    return handleAPIError(e);
  }
}
