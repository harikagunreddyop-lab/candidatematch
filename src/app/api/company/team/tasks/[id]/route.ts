/**
 * PATCH /api/company/team/tasks/[id] — Update task (status, assignee, etc.).
 * DELETE /api/company/team/tasks/[id] — Delete task.
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
    const { data: task } = await supabase
      .from('team_tasks')
      .select('id, company_id')
      .eq('id', id)
      .single();

    if (!task || task.company_id !== companyId)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.description !== undefined) update.description = body.description;
    if (body.assignee_id !== undefined) update.assignee_id = body.assignee_id ?? null;
    if (body.due_date !== undefined) update.due_date = body.due_date ?? null;
    if (body.priority !== undefined) update.priority = body.priority ?? null;
    if (body.status !== undefined) update.status = body.status;
    if (body.status === 'completed') update.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('team_tasks')
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
    const { data: task } = await supabase
      .from('team_tasks')
      .select('id, company_id')
      .eq('id', id)
      .single();

    if (!task || task.company_id !== companyId)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const { error } = await supabase.from('team_tasks').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleAPIError(e);
  }
}
