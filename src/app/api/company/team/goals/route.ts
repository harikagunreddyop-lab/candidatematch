/**
 * GET /api/company/team/goals — List goals (optional assignee_id, period).
 * POST /api/company/team/goals — Create goal.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import { parseBody, parseQuery } from '@/lib/validation/parse';
import { teamGoalCreateSchema, teamGoalQuerySchema } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const parsedQuery = parseQuery(
      {
        assignee_id: searchParams.get('assignee_id'),
        status: searchParams.get('status'),
      },
      teamGoalQuerySchema
    );
    if ('error' in parsedQuery) return parsedQuery.error;
    const { assignee_id: assigneeId, status } = parsedQuery.data;

    const supabase = createServiceClient();
    let q = supabase
      .from('team_goals')
      .select('*')
      .eq('company_id', companyId)
      .order('period_start', { ascending: false });

    if (assigneeId) q = q.eq('assignee_id', assigneeId);
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ goals: data ?? [] });
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
    const isAdmin = authResult.profile.effective_role === 'company_admin' || authResult.profile.effective_role === 'platform_admin';
    if (!isAdmin)
      return NextResponse.json({ error: 'Only company admin can create goals' }, { status: 403 });

    const rawBody = await req.json().catch(() => null);
    const parsedBody = parseBody(rawBody, teamGoalCreateSchema);
    if ('error' in parsedBody) return parsedBody.error;
    const { assignee_id, goal_type, target_value, current_value, period_start, period_end } = parsedBody.data;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('team_goals')
      .insert({
        company_id: companyId,
        assignee_id: assignee_id ?? null,
        goal_type,
        target_value,
        current_value,
        period_start,
        period_end,
        status: 'in_progress',
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
