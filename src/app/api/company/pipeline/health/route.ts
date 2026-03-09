/**
 * GET /api/company/pipeline/health — Pipeline health score, stage analysis, at-risk applications.
 * Query: job_id (optional).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import type { PipelineHealth, PipelineStageAnalysis, AtRiskApplication } from '@/types/pipeline';

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
    if (jobIds.length === 0) {
      return NextResponse.json({
        overall_score: 100,
        stage_analysis: [],
        predicted_time_to_fill_days: null,
        at_risk_applications: [],
      } satisfies PipelineHealth);
    }

    const jobsToUse = jobId ? (jobIds.includes(jobId) ? [jobId] : []) : jobIds;
    if (jobsToUse.length === 0) {
      return NextResponse.json({
        overall_score: 100,
        stage_analysis: [],
        predicted_time_to_fill_days: null,
        at_risk_applications: [],
      } satisfies PipelineHealth);
    }

    const [stagesRes, applicationsRes] = await Promise.all([
      supabase
        .from('pipeline_stages')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('stage_order', { ascending: true }),
      supabase
        .from('applications')
        .select('id, candidate_id, job_id, current_stage_id, status, updated_at, next_action_due')
        .in('job_id', jobsToUse),
    ]);

    const stages = stagesRes.data ?? [];
    const applications = applicationsRes.data ?? [];
    const appIds = applications.map((a: { id: string }) => a.id);
    let history: { application_id: string; to_stage_id: string; moved_at: string; duration_in_previous_stage_hours?: number }[] = [];
    if (appIds.length > 0) {
      const historyRes = await supabase
        .from('candidate_pipeline_history')
        .select('application_id, to_stage_id, moved_at, duration_in_previous_stage_hours')
        .in('application_id', appIds);
      history = historyRes.data ?? [];
    }

    const firstStageId = stages[0]?.id ?? null;
    const stageAnalysis: PipelineStageAnalysis[] = [];
    const atRisk: AtRiskApplication[] = [];

    for (const stage of stages) {
      const stageApps = applications.filter(
        (a: { current_stage_id?: string }) =>
          a.current_stage_id === stage.id ||
          (!a.current_stage_id && stage.id === firstStageId)
      );
      const count = stageApps.length;

      const entriesToStage = history.filter(
        (h: { to_stage_id: string }) => h.to_stage_id === stage.id
      );
      const durations = entriesToStage
        .map((h: { duration_in_previous_stage_hours?: number }) => h.duration_in_previous_stage_hours)
        .filter((d): d is number => typeof d === 'number');
      const avgTimeHours =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;
      const avgTimeDays = avgTimeHours / 24;

      const slaDays = (stage.sla_hours ?? 0) / 24;
      let bottleneck_severity: 'none' | 'minor' | 'major' | 'critical' = 'none';
      if (slaDays > 0) {
        if (avgTimeDays >= slaDays * 2) bottleneck_severity = 'critical';
        else if (avgTimeDays >= slaDays * 1.5) bottleneck_severity = 'major';
        else if (avgTimeDays >= slaDays * 1.2) bottleneck_severity = 'minor';
      }

      const totalIntoStage = entriesToStage.length;
      const totalFromPrevious = count + totalIntoStage;
      const conversionRate =
        totalFromPrevious > 0 ? (totalIntoStage / totalFromPrevious) * 100 : 0;

      const recommendations: string[] = [];
      if (bottleneck_severity === 'critical')
        recommendations.push(`Clear bottleneck: candidates stuck ~${avgTimeDays.toFixed(0)} days in ${stage.stage_name}.`);
      else if (bottleneck_severity === 'major')
        recommendations.push(`Review ${stage.stage_name}: average time ${avgTimeDays.toFixed(1)} days.`);
      if (conversionRate < 20 && count > 5)
        recommendations.push(`Low conversion into ${stage.stage_name}; review criteria.`);

      stageAnalysis.push({
        stage_id: stage.id,
        stage_name: stage.stage_name,
        avg_time_in_stage_days: Math.round(avgTimeDays * 10) / 10,
        conversion_rate: Math.round(conversionRate * 10) / 10,
        bottleneck_severity,
        recommendations,
        count,
      });
    }

    const criticalCount = stageAnalysis.filter((s) => s.bottleneck_severity === 'critical').length;
    const majorCount = stageAnalysis.filter((s) => s.bottleneck_severity === 'major').length;
    const overall_score = Math.max(
      0,
      Math.min(100, 100 - criticalCount * 25 - majorCount * 10)
    );

    if (appIds.length > 0) {
      const { data: appDetails } = await supabase
        .from('applications')
        .select('id, candidate_id, job_id, updated_at, next_action_due, current_stage_id')
        .in('id', appIds);
      const stageMap = new Map(stages.map((s: { id: string; stage_name: string; sla_hours?: number }) => [s.id, s]));
      const now = Date.now();
      for (const app of appDetails ?? []) {
        const stage = app.current_stage_id
          ? stageMap.get(app.current_stage_id)
          : stages[0];
        if (!stage) continue;
        const updatedAt = app.updated_at ? new Date(app.updated_at).getTime() : 0;
        const daysInStage = (now - updatedAt) / (24 * 60 * 60 * 1000);
        const slaDays = (stage.sla_hours ?? 0) / 24;
        if (slaDays > 0 && daysInStage > slaDays * 1.2) {
          const { data: cand } = await supabase
            .from('candidates')
            .select('full_name')
            .eq('id', app.candidate_id)
            .single();
          const { data: job } = await supabase
            .from('jobs')
            .select('title')
            .eq('id', app.job_id)
            .single();
          atRisk.push({
            application_id: app.id,
            candidate_name: cand?.full_name ?? 'Unknown',
            job_title: job?.title ?? 'Unknown',
            issue: `Stuck in ${stage.stage_name} for ${Math.round(daysInStage)} days (SLA ${stage.sla_hours}h)`,
            stage_name: stage.stage_name,
          });
        }
      }
    }

    const avgDaysToFill =
      stageAnalysis.length > 0
        ? stageAnalysis.reduce((sum, s) => sum + s.avg_time_in_stage_days, 0)
        : 0;
    const predicted_time_to_fill_days = Math.round(avgDaysToFill * 1.5);

    return NextResponse.json({
      overall_score,
      stage_analysis: stageAnalysis,
      predicted_time_to_fill_days,
      at_risk_applications: atRisk,
    } satisfies PipelineHealth);
  } catch (e) {
    return handleAPIError(e);
  }
}
