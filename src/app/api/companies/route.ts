import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const service = createServiceClient();
  const { effective_role, company_id } = auth.profile;

  if (effective_role === 'platform_admin') {
    const { data, error } = await service
      .from('companies')
      .select('*, owner:profiles!owner_id(name, email)')
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ companies: data });
  }

  if (company_id) {
    const { data, error } = await service.from('companies').select('*').eq('id', company_id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ company: data });
  }

  return NextResponse.json({ error: 'No company access' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin'] });
  if (auth instanceof Response) return auth;

  const rl = await rateLimitResponse(req, 'api', auth.user.id);
  if (rl) return rl;

  const body = await req.json().catch(() => ({}));
  const { name, slug, subscription_plan = 'starter', owner_email } = body;
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const service = createServiceClient();

  let owner_id: string | null = null;
  if (owner_email) {
    const { data: owner } = await service.from('profiles').select('id').eq('email', owner_email).single();
    owner_id = owner?.id || null;
  }

  const { data: company, error } = await service
    .from('companies').insert({ name, slug, subscription_plan, owner_id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (owner_id) {
    await service.from('profiles').update({
      company_id: company.id,
      effective_role: 'company_admin',
    }).eq('id', owner_id);
  }

  return NextResponse.json({ company });
}
