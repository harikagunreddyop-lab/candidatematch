/**
 * PATCH /api/company/team/goals/[id] — Update goal (current_value, status).
 * DELETE /api/company/team/goals/[id] — Delete goal.
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
    const { data: goal } = await supabase
      .from('team_goals')
      .select('id, company_id')
      .eq('id', id)
      .single();

    if (!goal || goal.company_id !== companyId)
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};
    if (body.current_value !== undefined) update.current_value = Number(body.current_value);
    if (body.status !== undefined) update.status = body.status;

    const { data, error } = await supabase
      .from('team_goals')
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
    const { data: goal } = await supabase
      .from('team_goals')
      .select('id, company_id')
      .eq('id', id)
      .single();

    if (!goal || goal.company_id !== companyId)
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    const { error } = await supabase.from('team_goals').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleAPIError(e);
  }
}
