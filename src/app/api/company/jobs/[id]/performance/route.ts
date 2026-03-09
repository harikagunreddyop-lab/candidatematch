/**
 * GET /api/company/jobs/[id]/performance
 * Job performance metrics: views, applications, funnel, sources.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 400 });

  const { id: jobId } = await params;
  const supabase = createServiceClient();

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, created_at, is_active')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single();

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const created = new Date((job as { created_at: string }).created_at).getTime();
  const days_open = Math.max(0, Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)));

  const [
    { data: apps },
    { data: byStatus },
    { data: external },
    { data: metricsRows },
  ] = await Promise.all([
    supabase.from('applications').select('id, status, created_at').eq('job_id', jobId),
    supabase.from('applications').select('status').eq('job_id', jobId),
    supabase.from('job_postings_external').select('board_name, views, applications, status').eq('job_id', jobId),
    supabase.from('job_performance_metrics').select('*').eq('job_id', jobId).order('metric_date', { ascending: false }).limit(30),
  ]);

  const applications = apps ?? [];
  const total_applications = applications.length;
  const statusCounts: Record<string, number> = {};
  for (const a of byStatus ?? []) {
    const s = (a as { status: string }).status;
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }
  const qualified_applications =
    (statusCounts['screening'] ?? 0) + (statusCounts['interview'] ?? 0) + (statusCounts['offer'] ?? 0);
  const interviews_scheduled = statusCounts['interview'] ?? 0;
  const offers_made = statusCounts['offer'] ?? 0;

  let total_views = 0;
  const source_breakdown: { source: string; applications: number; views: number }[] = [];
  for (const e of external ?? []) {
    const row = e as { board_name: string; views: number; applications: number };
    total_views += row.views ?? 0;
    source_breakdown.push({
      source: row.board_name,
      applications: row.applications ?? 0,
      views: row.views ?? 0,
    });
  }
  if (source_breakdown.length === 0) {
    source_breakdown.push({ source: 'Internal', applications: total_applications, views: total_applications });
    total_views = total_applications;
  }

  const conversion_rate = total_views > 0 ? (total_applications / total_views) * 100 : null;
  const quality_score = total_applications > 0 ? (qualified_applications / total_applications) * 100 : null;

  let time_to_first_application_hours: number | null = null;
  if (applications.length > 0) {
    type AppWithCreated = { created_at: string };
    const firstApp = applications.reduce((earliest: number, a: AppWithCreated) => {
      const t = new Date(a.created_at).getTime();
      return t < earliest ? t : earliest;
    }, Infinity);
    if (firstApp !== Infinity && created) {
      time_to_first_application_hours = Math.round((firstApp - created) / (60 * 60 * 1000));
    }
  }

  return NextResponse.json({
    job_id: jobId,
    job_title: (job as { title: string }).title,
    days_open,
    total_views,
    total_applications,
    qualified_applications,
    interviews_scheduled,
    offers_made,
    conversion_rate,
    quality_score,
    time_to_first_application_hours,
    conversion_funnel: {
      views: total_views,
      applications: total_applications,
      qualified: qualified_applications,
      interview: interviews_scheduled,
      offer: offers_made,
    },
    source_breakdown,
    metrics_over_time: metricsRows ?? [],
  });
}
