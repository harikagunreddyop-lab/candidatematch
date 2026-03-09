/**
 * GET /api/company/talent-pools — List talent pools.
 * POST /api/company/talent-pools — Create talent pool (optionally populate from criteria).
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

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('talent_pools')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pools: data ?? [] });
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
    const { pool_name, description, criteria } = body;
    if (!pool_name || typeof pool_name !== 'string' || !pool_name.trim())
      return NextResponse.json({ error: 'pool_name required' }, { status: 400 });

    const supabase = createServiceClient();

    const { data: pool, error: insertErr } = await supabase
      .from('talent_pools')
      .insert({
        company_id: companyId,
        pool_name: pool_name.trim(),
        description: description?.trim() ?? null,
        criteria: criteria && typeof criteria === 'object' ? criteria : {},
        candidate_count: 0,
        created_by: profileId,
        is_active: true,
      })
      .select()
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

    const crit = criteria && typeof criteria === 'object' ? criteria : {};
    const jobIds = (crit.job_ids as string[]) ?? [];
    if (jobIds.length > 0) {
      const { data: apps } = await supabase
        .from('applications')
        .select('candidate_id')
        .in('job_id', jobIds);
      const candidateIds = [...new Set((apps ?? []).map((a: { candidate_id: string }) => a.candidate_id))];
      if (candidateIds.length > 0 && pool) {
        await supabase.from('talent_pool_members').insert(
          candidateIds.map((candidate_id) => ({
            pool_id: pool.id,
            candidate_id,
            added_by: profileId,
          }))
        );
        await supabase
          .from('talent_pools')
          .update({ candidate_count: candidateIds.length })
          .eq('id', pool.id);
        const { data: updated } = await supabase.from('talent_pools').select('*').eq('id', pool.id).single();
        return NextResponse.json(updated ?? pool);
      }
    }

    return NextResponse.json(pool);
  } catch (e) {
    return handleAPIError(e);
  }
}
