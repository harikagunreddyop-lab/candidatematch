/**
 * POST /api/billing/company-checkout — Create Stripe Checkout session for company subscription
 * Body: { planId: 'starter' | 'growth' | 'enterprise', interval: 'monthly' | 'annual', companyId?: string }
 * companyId required for platform_admin; otherwise uses auth user's company_id
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { isCompanyPlanId } from '@/lib/plan-limits';
import { getAppUrl } from '@/config';

export const dynamic = 'force-dynamic';

const PRICE_IDS: Record<string, Record<string, string | undefined>> = {
  starter: {
    monthly: process.env.STRIPE_COMPANY_STARTER_MONTHLY,
    annual: process.env.STRIPE_COMPANY_STARTER_ANNUAL,
  },
  growth: {
    monthly: process.env.STRIPE_COMPANY_PRO_MONTHLY,
    annual: process.env.STRIPE_COMPANY_PRO_ANNUAL,
  },
  enterprise: {
    monthly: process.env.STRIPE_COMPANY_ENTERPRISE_MONTHLY,
    annual: process.env.STRIPE_COMPANY_ENTERPRISE_ANNUAL,
  },
};

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin'] });
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const planId = body.planId ?? body.plan;
  const interval = body.interval === 'annual' ? 'annual' : 'monthly';
  const companyIdParam = body.companyId ?? body.company_id;

  if (!planId || !isCompanyPlanId(planId)) {
    return NextResponse.json({ error: 'planId must be starter, growth, or enterprise' }, { status: 400 });
  }

  const effectiveCompanyId = auth.profile.effective_role === 'platform_admin'
    ? companyIdParam
    : auth.profile.company_id;

  if (!effectiveCompanyId) {
    return NextResponse.json({ error: 'Company context required' }, { status: 400 });
  }

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const APP_URL = getAppUrl();

  if (!STRIPE_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const priceKey = interval === 'annual' ? 'annual' : 'monthly';
  const priceId = PRICE_IDS[planId]?.[priceKey];
  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price not configured for ${planId}/${interval}. Set STRIPE_COMPANY_* env.` },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, stripe_customer_id')
    .eq('id', effectiveCompanyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  let customerId = company.stripe_customer_id;
  if (!customerId) {
    const customerRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        name: company.name || 'Company',
        'metadata[company_id]': company.id,
      }),
    });
    const customer = await customerRes.json();
    if (customer.error) {
      return NextResponse.json({ error: customer.error.message }, { status: 500 });
    }
    customerId = customer.id;
    await supabase
      .from('companies')
      .update({ stripe_customer_id: customerId })
      .eq('id', company.id);
  }

  const params = new URLSearchParams({
    mode: 'subscription',
    customer: customerId,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${APP_URL}/dashboard/company?upgraded=true`,
    cancel_url: `${APP_URL}/dashboard/company/settings/billing`,
    'metadata[company_id]': company.id,
    'metadata[plan]': planId,
    'metadata[interval]': interval,
  });

  const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const session = await sessionRes.json();
  if (session.error) {
    return NextResponse.json({ error: session.error.message }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
