/**
 * GET /api/applications/[id] — Fetch one application (candidate own, or recruiter/admin).
 * PATCH /api/applications/[id] — Update application (candidate: status, notes, withdrawal; recruiter/admin: full).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { applicationPatchSchema, uuidSchema } from '@/lib/validation/schemas';
import { parseBody, parseParams } from '@/lib/validation/parse';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;

  const parsedParams = parseParams(await params, uuidSchema.transform((id) => ({ id })));
  if ('error' in parsedParams) return parsedParams.error;
  const { id } = parsedParams.data;

  const supabase = createServiceClient();
  const { data: app, error } = await supabase
    .from('applications')
    .select(`
      id, candidate_id, job_id, status, applied_at, notes, interview_date, offer_details,
      next_action_required, next_action_due, withdrawal_reason,
      candidate_notes, interview_notes, created_at, updated_at,
      job:jobs(id, title, company, location, url)
    `)
    .eq('id', id)
    .single();

  if (error || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  if (authResult.profile.role === 'candidate') {
    const { data: c } = await supabase.from('candidates').select('id').eq('id', app.candidate_id).eq('user_id', authResult.user.id).single();
    if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else if (authResult.profile.role === 'recruiter') {
    const ok = await canAccessCandidate(authResult, app.candidate_id, supabase);
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updatedAt = app.updated_at ? new Date(app.updated_at) : null;
  const daysInStatus = updatedAt ? Math.floor((Date.now() - updatedAt.getTime()) / (24 * 60 * 60 * 1000)) : 0;

  return NextResponse.json({
    ...app,
    days_in_status: daysInStatus,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;

  const parsedParams = parseParams(await params, uuidSchema.transform((id) => ({ id })));
  if ('error' in parsedParams) return parsedParams.error;
  const { id } = parsedParams.data;

  const supabase = createServiceClient();
  const rawBody = await req.json().catch(() => null);
  if (!rawBody || typeof rawBody !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsedBody = parseBody(rawBody, applicationPatchSchema);
  if ('error' in parsedBody) return parsedBody.error;
  const body = parsedBody.data;

  const { data: app, error: fetchErr } = await supabase
    .from('applications')
    .select('candidate_id, job_id, status, applied_at')
    .eq('id', id)
    .single();

  if (fetchErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const isCandidate = authResult.profile.role === 'candidate';
  if (isCandidate) {
    const { data: c } = await supabase.from('candidates').select('id').eq('id', app.candidate_id).eq('user_id', authResult.user.id).single();
    if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else if (authResult.profile.role === 'recruiter') {
    const ok = await canAccessCandidate(authResult, app.candidate_id, supabase);
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const fromStatus = app.status;
  const toStatus = body.status !== undefined ? body.status : fromStatus;

  const updatePayload: Record<string, unknown> = {};
  if (body.status !== undefined) updatePayload.status = toStatus;
  if (body.notes !== undefined) updatePayload.notes = body.notes ?? null;
  if (body.candidate_notes !== undefined) updatePayload.candidate_notes = body.candidate_notes ?? null;
  if (body.interview_notes !== undefined) updatePayload.interview_notes = body.interview_notes ?? null;
  if (body.interview_date !== undefined) updatePayload.interview_date = body.interview_date ?? null;
  if (body.next_action_required !== undefined) updatePayload.next_action_required = body.next_action_required ?? null;
  if (body.next_action_due !== undefined) updatePayload.next_action_due = body.next_action_due ?? null;
  if (body.withdrawal_reason !== undefined) updatePayload.withdrawal_reason = body.withdrawal_reason ?? null;

  if (toStatus === 'applied') {
    (updatePayload as Record<string, unknown>).applied_at = new Date().toISOString();
  }

  const { data: updated, error } = await supabase
    .from('applications')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (fromStatus !== toStatus) {
    await supabase.from('application_status_history').insert({
      application_id: id,
      from_status: fromStatus,
      to_status: toStatus,
      notes: body.notes ?? null,
      actor_id: authResult.profile.id,
    });
  }

  return NextResponse.json(updated);
}
