/**
 * GET /api/company/talent-pools/[id]/members — List pool members (candidates).
 * POST /api/company/talent-pools/[id]/members — Add candidates to pool.
 * DELETE /api/company/talent-pools/[id]/members — Remove candidate from pool (body: candidate_id).
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

    const { id: poolId } = await params;
    if (!poolId) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: pool } = await supabase
      .from('talent_pools')
      .select('id, company_id')
      .eq('id', poolId)
      .eq('company_id', companyId)
      .single();

    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });

    const { data: members, error } = await supabase
      .from('talent_pool_members')
      .select('candidate_id, added_at, added_by')
      .eq('pool_id', poolId)
      .order('added_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const candidateIds = (members ?? []).map((m: { candidate_id: string }) => m.candidate_id);
    if (candidateIds.length === 0) return NextResponse.json({ members: [], candidates: [] });

    const { data: candidates } = await supabase
      .from('candidates')
      .select('id, full_name, primary_title, email, location')
      .in('id', candidateIds);

    const candMap = new Map((candidates ?? []).map((c: { id: string }) => [c.id, c]));
    const list = (members ?? []).map((m: { candidate_id: string; added_at: string; added_by: string | null }) => ({
      ...m,
      candidate: candMap.get(m.candidate_id),
    }));

    return NextResponse.json({ members: list, candidates: candidates ?? [] });
  } catch (e) {
    return handleAPIError(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    const profileId = authResult.profile.id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id: poolId } = await params;
    if (!poolId) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const candidateIds = Array.isArray(body.candidate_ids) ? body.candidate_ids : [body.candidate_id].filter(Boolean);
    if (candidateIds.length === 0)
      return NextResponse.json({ error: 'candidate_ids or candidate_id required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: pool } = await supabase
      .from('talent_pools')
      .select('id, company_id')
      .eq('id', poolId)
      .eq('company_id', companyId)
      .single();

    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });

    const rows = candidateIds.map((candidate_id: string) => ({
      pool_id: poolId,
      candidate_id,
      added_by: profileId,
    }));

    const { error: insertErr } = await supabase.from('talent_pool_members').upsert(rows, {
      onConflict: 'pool_id,candidate_id',
      ignoreDuplicates: true,
    });

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

    const { count } = await supabase
      .from('talent_pool_members')
      .select('*', { count: 'exact', head: true })
      .eq('pool_id', poolId);
    await supabase.from('talent_pools').update({ candidate_count: count ?? 0 }).eq('id', poolId);

    return NextResponse.json({ added: rows.length, candidate_count: count ?? 0 });
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

    const { id: poolId } = await params;
    if (!poolId) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const candidateId = body.candidate_id;
    if (!candidateId)
      return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: pool } = await supabase
      .from('talent_pools')
      .select('id, company_id')
      .eq('id', poolId)
      .eq('company_id', companyId)
      .single();

    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });

    const { error } = await supabase
      .from('talent_pool_members')
      .delete()
      .eq('pool_id', poolId)
      .eq('candidate_id', candidateId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { count } = await supabase
      .from('talent_pool_members')
      .select('*', { count: 'exact', head: true })
      .eq('pool_id', poolId);
    await supabase.from('talent_pools').update({ candidate_count: count ?? 0 }).eq('id', poolId);

    return NextResponse.json({ ok: true, candidate_count: count ?? 0 });
  } catch (e) {
    return handleAPIError(e);
  }
}
