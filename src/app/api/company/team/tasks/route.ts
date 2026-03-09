/**
 * GET /api/company/team/tasks — List tasks (optional assignee_id, status).
 * POST /api/company/team/tasks — Create task.
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
    const assigneeId = searchParams.get('assignee_id') || undefined;
    const status = searchParams.get('status') || undefined;

    const supabase = createServiceClient();
    let q = supabase
      .from('team_tasks')
      .select('*, assignee:profiles!assignee_id(id, name, email), created_by_profile:profiles!created_by(id, name)')
      .eq('company_id', companyId)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (assigneeId) q = q.eq('assignee_id', assigneeId);
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tasks: data ?? [] });
  } catch (e) {
    return handleAPIError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    const profileId = authResult.profile.id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const {
      title,
      description,
      assignee_id,
      related_candidate_id,
      related_job_id,
      due_date,
      priority,
    } = body;
    if (!title || typeof title !== 'string' || !title.trim())
      return NextResponse.json({ error: 'title required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('team_tasks')
      .insert({
        company_id: companyId,
        title: title.trim(),
        description: description?.trim() ?? null,
        assignee_id: assignee_id ?? null,
        related_candidate_id: related_candidate_id ?? null,
        related_job_id: related_job_id ?? null,
        due_date: due_date ?? null,
        priority: priority ?? null,
        status: 'pending',
        created_by: profileId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    return handleAPIError(e);
  }
}
