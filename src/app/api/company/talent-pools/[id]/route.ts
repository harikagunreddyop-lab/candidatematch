/**
 * GET /api/company/talent-pools/[id] — Get one pool with member count.
 * PATCH /api/company/talent-pools/[id] — Update pool.
 * DELETE /api/company/talent-pools/[id] — Deactivate pool.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(
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
    const { data, error } = await supabase
      .from('talent_pools')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    return handleAPIError(e);
  }
}

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
    const { data: pool } = await supabase
      .from('talent_pools')
      .select('id, company_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};
    if (body.pool_name !== undefined) update.pool_name = String(body.pool_name).trim();
    if (body.description !== undefined) update.description = body.description ?? null;
    if (body.criteria !== undefined) update.criteria = typeof body.criteria === 'object' ? body.criteria : {};
    if (body.is_active !== undefined) update.is_active = !!body.is_active;

    const { data, error } = await supabase
      .from('talent_pools')
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
    const { data: pool } = await supabase
      .from('talent_pools')
      .select('id, company_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });

    const { error } = await supabase.from('talent_pools').update({ is_active: false }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleAPIError(e);
  }
}
