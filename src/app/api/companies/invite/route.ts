import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin'] });
  if (auth instanceof Response) return auth;

  const rl = await rateLimitResponse(req, 'api', auth.user.id);
  if (rl) return rl;

  const body = await req.json().catch(() => ({}));
  const { email, role, company_id: bodyCompanyId } = body;

  if (!email || !role) return NextResponse.json({ error: 'email and role required' }, { status: 400 });
  if (!['company_admin', 'recruiter'].includes(role)) {
    return NextResponse.json({ error: 'role must be company_admin or recruiter' }, { status: 400 });
  }

  const targetCompanyId = auth.profile.effective_role === 'platform_admin'
    ? (bodyCompanyId || auth.profile.company_id)
    : auth.profile.company_id;

  if (!targetCompanyId) return NextResponse.json({ error: 'No company context' }, { status: 400 });

  const service = createServiceClient();

  // Check recruiter limit for the company
  if (role === 'recruiter') {
    const { data: company } = await service.from('companies').select('max_recruiters').eq('id', targetCompanyId).single();
    const { count } = await service.from('profiles').select('id', { count: 'exact', head: true })
      .eq('company_id', targetCompanyId).in('effective_role', ['recruiter', 'company_admin']);
    if (company && (count || 0) >= company.max_recruiters) {
      return NextResponse.json({ error: `Team limit reached (${company.max_recruiters} members on your plan)` }, { status: 429 });
    }
  }

  const { data: invitation, error } = await service
    .from('company_invitations')
    .insert({ company_id: targetCompanyId, invited_by: auth.user.id, email, role })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The token for the invite link:
  // `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${invitation.token}`
  // TODO: send email via your provider (Resend / Postmark / SendGrid)

  return NextResponse.json({ invitation, token: invitation.token });
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin'] });
  if (auth instanceof Response) return auth;

  const service = createServiceClient();
  const companyId = auth.profile.effective_role === 'platform_admin'
    ? req.nextUrl.searchParams.get('company_id') || auth.profile.company_id
    : auth.profile.company_id;

  if (!companyId) return NextResponse.json({ invitations: [] });

  const { data } = await service.from('company_invitations')
    .select('*').eq('company_id', companyId).order('created_at', { ascending: false });

  return NextResponse.json({ invitations: data || [] });
}
