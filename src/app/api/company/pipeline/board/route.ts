/**
 * GET /api/company/pipeline/board — Stages + applications grouped by stage (for Kanban).
 * Query: job_id (optional) to filter by job.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('job_id') || undefined;

    const supabase = createServiceClient();

    const { data: companyJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('company_id', companyId);
    const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);
    if (jobIds.length === 0)
      return NextResponse.json({ stages: [], applications: [], applicationsByStage: {} });

    const jobsToUse = jobId ? (jobIds.includes(jobId) ? [jobId] : []) : jobIds;
    if (jobsToUse.length === 0)
      return NextResponse.json({ stages: [], applications: [], applicationsByStage: {} });

    const [stagesRes, applicationsRes, matchesRes] = await Promise.all([
      supabase
        .from('pipeline_stages')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('stage_order', { ascending: true }),
      supabase
        .from('applications')
        .select(
          'id, candidate_id, job_id, status, current_stage_id, applied_at, interview_date, next_action_required, next_action_due, updated_at, created_at, job:jobs(id, title, company, location, url), candidate:candidates(id, full_name, primary_title, location, email)'
        )
        .in('job_id', jobsToUse)
        .order('updated_at', { ascending: false }),
      supabase
        .from('candidate_job_matches')
        .select('candidate_id, job_id, fit_score, candidate:candidates(id, full_name, primary_title, location), job:jobs(id, title, company, location, url)')
        .in('job_id', jobsToUse)
        .gte('fit_score', 50)
        .order('fit_score', { ascending: false })
        .limit(100),
    ]);

    const stages = stagesRes.data ?? [];
    const applications = applicationsRes.data ?? [];
    const matches = matchesRes.data ?? [];
    const appliedSet = new Set(
      applications.map((a: { candidate_id: string; job_id: string }) => `${a.candidate_id}:${a.job_id}`)
    );

    const firstStageId = stages[0]?.id ?? null;
    const applicationsByStage: Record<string, unknown[]> = {};
    stages.forEach((s: { id: string }) => {
      applicationsByStage[s.id] = [];
    });

    for (const app of applications) {
      const stageId = (app as { current_stage_id?: string }).current_stage_id;
      const status = (app as { status?: string }).status;
      let resolvedStageId = stageId && stages.some((s: { id: string }) => s.id === stageId) ? stageId : null;
      if (!resolvedStageId && status) {
        const match = stages.find((s: { status_key?: string }) => s.status_key === status);
        if (match) resolvedStageId = match.id;
      }
      if (!resolvedStageId) resolvedStageId = firstStageId;
      if (resolvedStageId && applicationsByStage[resolvedStageId])
        applicationsByStage[resolvedStageId].push({ ...app, _type: 'application' });
    }

    if (firstStageId && applicationsByStage[firstStageId]) {
      for (const m of matches) {
        const key = `${(m as { candidate_id: string }).candidate_id}:${(m as { job_id: string }).job_id}`;
        if (!appliedSet.has(key))
          applicationsByStage[firstStageId].push({ ...m, _type: 'match' });
      }
    }

    return NextResponse.json({
      stages,
      applications,
      applicationsByStage,
    });
  } catch (e) {
    return handleAPIError(e);
  }
}
