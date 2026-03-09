/**
 * POST /api/billing/webhook — Stripe webhook handler
 *
 * Listens for: checkout.session.completed, customer.subscription.updated,
 * customer.subscription.deleted
 * Supports both profile (candidate Pro) and company subscriptions via metadata.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase-server';
import { getCompanyPlanLimits, isCompanyPlanId } from '@/lib/plan-limits';

export const dynamic = 'force-dynamic';

const stripeEventSchema = z.object({
    type: z.string().min(1),
    data: z.object({
        object: z.record(z.string(), z.any()).optional(),
    }).optional(),
});

function toHexHmac(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function verifyStripeSignature(rawBody: string, signatureHeader: string | null, signingSecret: string): boolean {
    if (!signatureHeader) return false;
    const values = signatureHeader.split(',').map((part) => part.trim());
    const timestamp = values.find((part) => part.startsWith('t='))?.slice(2);
    const signature = values.find((part) => part.startsWith('v1='))?.slice(3);
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = toHexHmac(signedPayload, signingSecret);
    if (expected.length !== signature.length) return false;
    return Buffer.from(expected, 'utf8').equals(Buffer.from(signature, 'utf8'));
}

export async function POST(req: NextRequest) {
    const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

    if (!STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const rawBody = await req.text();
    const signatureHeader = req.headers.get('stripe-signature');
    if (!verifyStripeSignature(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET)) {
        return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 401 });
    }

    let event: z.infer<typeof stripeEventSchema>;
    try {
        event = stripeEventSchema.parse(JSON.parse(rawBody));
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const supabase = createServiceClient();

    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data?.object;
            const userId = session?.metadata?.user_id;
            const companyId = session?.metadata?.company_id;
            const subscriptionId = session?.subscription;
            const successFeeEventId = session?.metadata?.success_fee_event_id;

            if (successFeeEventId && session?.mode === 'payment') {
                await supabase
                    .from('success_fee_events')
                    .update({ status: 'paid', updated_at: new Date().toISOString() })
                    .eq('id', successFeeEventId);
            } else if (companyId && subscriptionId) {
                const plan = session?.metadata?.plan;
                const planKey = plan && isCompanyPlanId(plan) ? plan : 'starter';
                const limits = getCompanyPlanLimits(planKey);

                const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
                    headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
                });
                const sub = await subRes.json();

                await supabase
                    .from('companies')
                    .update({
                        subscription_plan: planKey,
                        subscription_status: 'active',
                        subscription_period_end: sub.current_period_end
                            ? new Date(sub.current_period_end * 1000).toISOString()
                            : null,
                        max_recruiters: limits.max_recruiters,
                        max_active_jobs: limits.max_active_jobs,
                        max_candidates_viewed: limits.max_candidates_viewed === -1 ? 999 : limits.max_candidates_viewed,
                        max_ai_calls_per_day: limits.max_ai_calls_per_day,
                    })
                    .eq('id', companyId);
            } else if (userId && subscriptionId) {
                // Candidate Pro / Pro Plus (from /api/billing/checkout or /api/billing/upgrade)
                const candidateId = session?.metadata?.candidate_id;
                const planName = session?.metadata?.plan_name || 'pro';

                const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
                    headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
                });
                const sub = await subRes.json();
                const periodEnd = sub.current_period_end
                    ? new Date(sub.current_period_end * 1000).toISOString()
                    : null;
                const periodStart = sub.current_period_start
                    ? new Date(sub.current_period_start * 1000).toISOString()
                    : null;

                await supabase.from('profiles').update({
                    subscription_tier: planName,
                    subscription_status: 'active',
                    stripe_subscription_id: subscriptionId,
                    subscription_period_end: periodEnd,
                }).eq('id', userId);

                if (candidateId) {
                    await supabase.from('candidate_subscriptions').upsert(
                        {
                            candidate_id: candidateId,
                            plan_name: planName,
                            status: 'active',
                            stripe_subscription_id: subscriptionId,
                            current_period_start: periodStart,
                            current_period_end: periodEnd,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: 'candidate_id' }
                    );
                }
            }
            break;
        }

        case 'customer.subscription.updated': {
            const sub = event.data?.object;
            const customerId = sub?.customer;
            const subscriptionId = sub?.id;

            const [{ data: profile }, { data: company }, { data: candidateSub }] = await Promise.all([
                supabase.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle(),
                supabase.from('companies').select('id').eq('stripe_customer_id', customerId).maybeSingle(),
                supabase.from('candidate_subscriptions').select('candidate_id').eq('stripe_subscription_id', subscriptionId).maybeSingle(),
            ]);

            const status = sub?.status === 'active' ? 'active'
                : sub?.status === 'past_due' ? 'past_due'
                    : 'canceled';
            const periodEnd = sub?.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null;
            const periodStart = sub?.current_period_start
                ? new Date(sub.current_period_start * 1000).toISOString()
                : null;

            if (company) {
                await supabase
                    .from('companies')
                    .update({
                        subscription_status: status,
                        subscription_period_end: periodEnd,
                    })
                    .eq('id', company.id);
            }
            if (profile) {
                await supabase.from('profiles').update({
                    subscription_status: status,
                    subscription_period_end: periodEnd,
                }).eq('id', profile.id);
            }
            if (candidateSub) {
                await supabase.from('candidate_subscriptions').update({
                    status,
                    current_period_start: periodStart,
                    current_period_end: periodEnd,
                    updated_at: new Date().toISOString(),
                }).eq('candidate_id', candidateSub.candidate_id);
            }
            break;
        }

        case 'customer.subscription.deleted': {
            const sub = event.data?.object;
            const customerId = sub?.customer;
            const subscriptionId = sub?.id;

            const [{ data: profile }, { data: company }, { data: candidateSub }] = await Promise.all([
                supabase.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle(),
                supabase.from('companies').select('id').eq('stripe_customer_id', customerId).maybeSingle(),
                supabase.from('candidate_subscriptions').select('candidate_id').eq('stripe_subscription_id', subscriptionId).maybeSingle(),
            ]);

            if (company) {
                await supabase
                    .from('companies')
                    .update({
                        subscription_status: 'canceled',
                        subscription_period_end: null,
                    })
                    .eq('id', company.id);
            }
            if (profile) {
                await supabase.from('profiles').update({
                    subscription_tier: 'free',
                    subscription_status: 'canceled',
                    stripe_subscription_id: null,
                    subscription_period_end: null,
                }).eq('id', profile.id);
            }
            if (candidateSub) {
                await supabase.from('candidate_subscriptions').update({
                    status: 'canceled',
                    stripe_subscription_id: null,
                    current_period_start: null,
                    current_period_end: null,
                    updated_at: new Date().toISOString(),
                }).eq('candidate_id', candidateSub.candidate_id);
            }
            break;
        }
    }

    return NextResponse.json({ received: true });
}
