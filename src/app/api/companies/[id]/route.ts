import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const service = createServiceClient();
  const { effective_role, company_id } = auth.profile;

  // Scoping: company members can only see their own company
  if (effective_role !== 'platform_admin' && company_id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [companyRes, analyticsRes, teamRes] = await Promise.all([
    service.from('companies').select('*').eq('id', id).single(),
    service.from('company_analytics').select('*').eq('company_id', id).single(),
    service.from('profiles').select('id, name, email, effective_role, last_active_at')
      .eq('company_id', id).in('effective_role', ['company_admin', 'recruiter']),
  ]);

  return NextResponse.json({
    company: companyRes.data,
    analytics: analyticsRes.data,
    team: teamRes.data || [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const { effective_role, company_id } = auth.profile;
  if (effective_role !== 'platform_admin' && company_id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  // Only allow safe fields to be updated by company_admin
  const allowedFields = effective_role === 'platform_admin'
    ? ['name', 'slug', 'logo_url', 'website', 'industry', 'size_range', 'description', 'subscription_plan', 'subscription_status', 'max_recruiters', 'max_active_jobs', 'is_active']
    : ['name', 'logo_url', 'website', 'industry', 'size_range', 'description'];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  const service = createServiceClient();
  const { data, error } = await service.from('companies').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ company: data });
}
