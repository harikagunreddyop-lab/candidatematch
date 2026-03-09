/**
 * GET /api/company/team/[userId]/permissions — List permissions for a user.
 * POST /api/company/team/[userId]/permissions — Set a permission (body: permissionKey, granted).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    const isAdmin = authResult.profile.effective_role === 'company_admin' || authResult.profile.effective_role === 'platform_admin';
    if (!isAdmin)
      return NextResponse.json({ error: 'Only company admin can view permissions' }, { status: 403 });

    const { userId } = await params;
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from('profile_roles')
      .select('id, company_id')
      .eq('id', userId)
      .single();
    if (!profile || (profile as { company_id: string }).company_id !== companyId)
      return NextResponse.json({ error: 'User not in company' }, { status: 404 });

    const { data: rows, error } = await supabase
      .from('team_permissions')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const map: Record<string, boolean> = {};
    (rows ?? []).forEach((r: { permission_key: string; granted: boolean }) => {
      map[r.permission_key] = r.granted;
    });
    return NextResponse.json({ permissions: map });
  } catch (e) {
    return handleAPIError(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    const profileId = authResult.profile.id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    const isAdmin = authResult.profile.effective_role === 'company_admin' || authResult.profile.effective_role === 'platform_admin';
    if (!isAdmin)
      return NextResponse.json({ error: 'Only company admin can set permissions' }, { status: 403 });

    const { userId } = await params;
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const { permissionKey, granted } = body;
    if (!permissionKey || typeof granted !== 'boolean')
      return NextResponse.json({ error: 'permissionKey and granted (boolean) required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from('profile_roles')
      .select('id, company_id')
      .eq('id', userId)
      .single();
    if (!profile || (profile as { company_id: string }).company_id !== companyId)
      return NextResponse.json({ error: 'User not in company' }, { status: 404 });

    const { data, error } = await supabase
      .from('team_permissions')
      .upsert(
        {
          company_id: companyId,
          user_id: userId,
          permission_key: permissionKey,
          granted,
          granted_by: profileId,
          granted_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,user_id,permission_key' }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    return handleAPIError(e);
  }
}
