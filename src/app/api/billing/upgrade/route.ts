/**
 * POST /api/billing/upgrade
 * Create Stripe Checkout session for candidate plan upgrade (Pro or Pro Plus).
 * Body: { planName: 'pro' | 'pro_plus' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { roles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!STRIPE_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const planName = body.planName === 'pro_plus' ? 'pro_plus' : body.planName === 'pro' ? 'pro' : null;
  if (!planName) {
    return NextResponse.json({ error: 'Invalid planName; use pro or pro_plus' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, email')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });
  }

  const { data: plan } = await supabase
    .from('pricing_plans')
    .select('name, display_name, price_monthly_cents')
    .eq('name', planName)
    .single();

  if (!plan || plan.price_monthly_cents <= 0) {
    return NextResponse.json({ error: 'Plan not found or not purchasable' }, { status: 400 });
  }

  let customerId: string | null = null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', auth.user.id)
    .single();

  customerId = profile?.stripe_customer_id ?? null;

  if (!customerId) {
    const customerRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email: auth.user.email || candidate.email || '',
        'metadata[user_id]': auth.user.id,
        'metadata[candidate_id]': candidate.id,
      }),
    });
    const customer = await customerRes.json();
    if (customer.id) {
      customerId = customer.id;
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', auth.user.id);
    }
  }

  if (!customerId) {
    return NextResponse.json({ error: 'Could not create or find Stripe customer' }, { status: 500 });
  }

  const params = new URLSearchParams({
    mode: 'subscription',
    customer: customerId,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': `CandidateMatch ${plan.display_name}`,
    'line_items[0][price_data][product_data][description]': `CandidateMatch ${plan.display_name} Plan`,
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][unit_amount]': String(plan.price_monthly_cents),
    'line_items[0][quantity]': '1',
    success_url: `${APP_URL}/dashboard/candidate?upgraded=true`,
    cancel_url: `${APP_URL}/pricing`,
    'metadata[candidate_id]': candidate.id,
    'metadata[plan_name]': planName,
    'metadata[user_id]': auth.user.id,
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
