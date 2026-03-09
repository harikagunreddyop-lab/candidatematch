/**
 * POST /api/recruiter/dashboard/complete-task — Log task completion with optional time spent.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    const userId = authResult.profile.id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { task_id, task_type, actual_minutes } = body;
    if (!task_id || !task_type)
      return NextResponse.json({ error: 'task_id and task_type required' }, { status: 400 });

    const supabase = createServiceClient();
    const { error } = await supabase.from('activity_log').insert({
      company_id: companyId,
      user_id: userId,
      action: 'recruiter_task_completed',
      resource_type: 'task',
      resource_id: null,
      metadata: {
        task_id: String(task_id),
        task_type: String(task_type),
        actual_minutes: actual_minutes != null ? Number(actual_minutes) : null,
      },
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleAPIError(e);
  }
}
