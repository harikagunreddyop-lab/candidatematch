/**
 * GET /api/company/pipeline/stages — List pipeline stages for company.
 * POST /api/company/pipeline/stages — Create a new stage.
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
      .from('pipeline_stages')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('stage_order', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ stages: data ?? [] });
  } catch (e) {
    return handleAPIError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { stage_name, stage_order, stage_color, status_key, sla_hours } = body;

    if (!stage_name || typeof stage_order !== 'number')
      return NextResponse.json(
        { error: 'stage_name and stage_order required' },
        { status: 400 }
      );

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('pipeline_stages')
      .insert({
        company_id: companyId,
        stage_name: String(stage_name).trim(),
        stage_order: Math.max(0, stage_order),
        stage_color: stage_color ?? null,
        status_key: status_key ?? null,
        sla_hours: typeof sla_hours === 'number' ? sla_hours : null,
        is_active: true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    return handleAPIError(e);
  }
}
