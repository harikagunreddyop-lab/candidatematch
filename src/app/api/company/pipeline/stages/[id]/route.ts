/**
 * PATCH /api/company/pipeline/stages/[id] — Update stage (name, color, order, automation).
 * DELETE /api/company/pipeline/stages/[id] — Deactivate stage (soft delete).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('id, company_id')
      .eq('id', id)
      .single();

    if (!stage || stage.company_id !== companyId)
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};
    if (body.stage_name !== undefined) update.stage_name = String(body.stage_name).trim();
    if (body.stage_color !== undefined) update.stage_color = body.stage_color ?? null;
    if (body.stage_order !== undefined) update.stage_order = Math.max(0, body.stage_order);
    if (body.status_key !== undefined) update.status_key = body.status_key ?? null;
    if (body.sla_hours !== undefined) update.sla_hours = body.sla_hours ?? null;
    if (body.auto_move_rules !== undefined)
      update.auto_move_rules = Array.isArray(body.auto_move_rules) ? body.auto_move_rules : [];

    const { data, error } = await supabase
      .from('pipeline_stages')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    return handleAPIError(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('id, company_id')
      .eq('id', id)
      .single();

    if (!stage || stage.company_id !== companyId)
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

    const { error } = await supabase
      .from('pipeline_stages')
      .update({ is_active: false })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleAPIError(e);
  }
}
