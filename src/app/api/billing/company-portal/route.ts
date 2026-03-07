/**
 * POST /api/billing/company-portal — Create Stripe Customer Portal session for company billing
 * Auth: company_admin or platform_admin. Uses company's stripe_customer_id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin'] });
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const companyIdParam = body.companyId ?? body.company_id;
  const effectiveCompanyId = auth.profile.effective_role === 'platform_admin'
    ? companyIdParam
    : auth.profile.company_id;

  if (!effectiveCompanyId) {
    return NextResponse.json({ error: 'Company context required' }, { status: 400 });
  }

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!STRIPE_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const supabase = createServiceClient();
  const { data: company } = await supabase
    .from('companies')
    .select('stripe_customer_id')
    .eq('id', effectiveCompanyId)
    .single();

  if (!company?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found for this company' }, { status: 404 });
  }

  const params = new URLSearchParams({
    customer: company.stripe_customer_id,
    return_url: `${APP_URL}/dashboard/company/settings/billing`,
  });

  const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const portal = await portalRes.json();
  if (portal.error) {
    return NextResponse.json({ error: portal.error.message }, { status: 500 });
  }

  return NextResponse.json({ url: portal.url });
}
