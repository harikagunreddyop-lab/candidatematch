/**
 * GET /api/recruiter/dashboard/activity — Activity timeline for recruiter (company activity, optional user filter).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import type { ActivityTimelineItem } from '@/types/recruiter-dashboard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    const profileId = authResult.profile.id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const mineOnly = searchParams.get('mine') === 'true';
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

    const supabase = createServiceClient();
    let q = supabase
      .from('activity_log')
      .select('id, action, resource_type, resource_id, metadata, created_at, user_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (mineOnly) q = q.eq('user_id', profileId);
    const { data: rows } = await q;

    const userIds = [...new Set((rows ?? []).map((r: { user_id?: string }) => r.user_id).filter(Boolean))];
    let profileMap: Map<string, { name?: string }> = new Map();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      profileMap = new Map((profiles ?? []).map((p: { id: string; name?: string }) => [p.id, { name: p.name }]));
    }

    const activity: ActivityTimelineItem[] = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      action: r.action as string,
      resource_type: r.resource_type as string | null,
      resource_id: r.resource_id as string | null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      created_at: r.created_at as string,
      user_name: r.user_id ? profileMap.get(r.user_id as string)?.name : null,
    }));
    return NextResponse.json({ activity });
  } catch (e) {
    return handleAPIError(e);
  }
}
