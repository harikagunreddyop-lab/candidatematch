/**
 * POST /api/company/pipeline/move — Move an application to a pipeline stage.
 * Records candidate_pipeline_history and updates application (current_stage_id + status).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import { parseBody } from '@/lib/validation/parse';
import { pipelineMoveSchema } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    const profileId = authResult.profile.id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const rawBody = await req.json().catch(() => null);
    const parsedBody = parseBody(rawBody, pipelineMoveSchema);
    if ('error' in parsedBody) return parsedBody.error;
    const { application_id, to_stage_id, notes } = parsedBody.data;

    const supabase = createServiceClient();

    const { data: app } = await supabase
      .from('applications')
      .select('id, candidate_id, job_id, current_stage_id, status, updated_at')
      .eq('id', application_id)
      .single();

    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    const { data: job } = await supabase
      .from('jobs')
      .select('id, company_id')
      .eq('id', app.job_id)
      .single();
    if (!job || job.company_id !== companyId)
      return NextResponse.json({ error: 'Application not in your company' }, { status: 403 });

    const { data: toStage } = await supabase
      .from('pipeline_stages')
      .select('id, stage_name, status_key, company_id')
      .eq('id', to_stage_id)
      .single();

    if (!toStage || toStage.company_id !== companyId)
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

    const fromStageId = app.current_stage_id ?? null;
    let fromStageName: string | null = null;
    if (fromStageId) {
      const { data: fromStage } = await supabase
        .from('pipeline_stages')
        .select('stage_name')
        .eq('id', fromStageId)
        .single();
      fromStageName = fromStage?.stage_name ?? null;
    }

    const now = new Date().toISOString();
    let durationInPreviousStageHours: number | null = null;
    if (app.updated_at) {
      const prev = new Date(app.updated_at).getTime();
      durationInPreviousStageHours = Math.round((Date.now() - prev) / (60 * 60 * 1000));
    }

    const { error: historyError } = await supabase.from('candidate_pipeline_history').insert({
      application_id,
      from_stage: fromStageName,
      to_stage: toStage.stage_name,
      from_stage_id: fromStageId,
      to_stage_id: to_stage_id,
      moved_by: profileId,
      moved_at: now,
      duration_in_previous_stage_hours: durationInPreviousStageHours,
      notes: notes ?? null,
    });

    if (historyError)
      return NextResponse.json(
        { error: 'Failed to record history: ' + historyError.message },
        { status: 500 }
      );

    const updatePayload: Record<string, unknown> = {
      current_stage_id: to_stage_id,
      updated_at: now,
    };
    if (toStage.status_key) updatePayload.status = toStage.status_key;

    const { data: updated, error: updateError } = await supabase
      .from('applications')
      .update(updatePayload)
      .eq('id', application_id)
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    return NextResponse.json(updated);
  } catch (e) {
    return handleAPIError(e);
  }
}
