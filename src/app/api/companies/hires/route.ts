/**
 * POST /api/companies/hires — Record a hire and create success-fee charge (Stripe Checkout one-time)
 * Body: { candidate_id: string, job_id?: string }
 * Auth: company_admin or recruiter for the company
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { getCompanyPlanLimits, isCompanyPlanId } from '@/lib/plan-limits';
import { getAppUrl } from '@/config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const candidateId = body.candidate_id;
  const jobId = body.job_id ?? null;
  if (!candidateId || typeof candidateId !== 'string') {
    return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });
  }

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const APP_URL = getAppUrl();

  if (!STRIPE_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const supabase = createServiceClient();

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, subscription_plan, stripe_customer_id')
    .eq('id', companyId)
    .single();

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  if (!company.stripe_customer_id) {
    return NextResponse.json({ error: 'Company has no billing account. Complete a subscription first.' }, { status: 400 });
  }

  const planKey = isCompanyPlanId(company.subscription_plan) ? company.subscription_plan : 'starter';
  const limits = getCompanyPlanLimits(planKey);
  const amountCents = limits.success_fee_cents;

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, full_name')
    .eq('id', candidateId)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  const { data: existing } = await supabase
    .from('success_fee_events')
    .select('id')
    .eq('company_id', companyId)
    .eq('candidate_id', candidateId)
    .in('status', ['pending', 'invoiced', 'paid'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Hire already recorded for this candidate' }, { status: 409 });
  }

  const { data: event, error: insertErr } = await supabase
    .from('success_fee_events')
    .insert({
      company_id: companyId,
      candidate_id: candidateId,
      job_id: jobId,
      amount_cents: amountCents,
      currency: 'usd',
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const description = `Success fee: ${candidate.full_name || 'Candidate'} hired`;

  const params = new URLSearchParams({
    mode: 'payment',
    customer: company.stripe_customer_id,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amountCents),
    'line_items[0][price_data][product_data][name]': 'Success fee — Candidate hired',
    'line_items[0][price_data][product_data][description]': description,
    'line_items[0][quantity]': '1',
    success_url: `${APP_URL}/dashboard/company?hire_paid=true`,
    cancel_url: `${APP_URL}/dashboard/company?hire_canceled=true`,
    'metadata[company_id]': companyId,
    'metadata[success_fee_event_id]': event.id,
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
    await supabase.from('success_fee_events').update({ status: 'pending' }).eq('id', event.id);
    return NextResponse.json({ error: session.error.message }, { status: 500 });
  }

  return NextResponse.json({
    success_fee_event_id: event.id,
    amount_cents: amountCents,
    checkout_url: session.url,
    message: 'Hire recorded. Complete payment via the link to pay the success fee.',
  });
}
