/**
 * POST /api/billing/webhook — Stripe webhook handler
 *
 * Listens for: checkout.session.completed, customer.subscription.updated,
 * customer.subscription.deleted
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Stripe sends raw body — Next.js App Router handles this natively
export async function POST(req: NextRequest) {
    const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

    if (!STRIPE_SECRET) {
        return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    // In production, verify Stripe signature
    // For now, we trust the event (add signature verification with stripe SDK later)
    let event: any;
    try {
        event = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const supabase = createServiceClient();

    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            const userId = session.metadata?.user_id;
            const subscriptionId = session.subscription;

            if (userId && subscriptionId) {
                // Fetch subscription details
                const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
                    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` },
                });
                const sub = await subRes.json();

                await supabase.from('profiles').update({
                    subscription_tier: 'pro',
                    subscription_status: 'active',
                    stripe_subscription_id: subscriptionId,
                    subscription_period_end: sub.current_period_end
                        ? new Date(sub.current_period_end * 1000).toISOString()
                        : null,
                }).eq('id', userId);
            }
            break;
        }

        case 'customer.subscription.updated': {
            const sub = event.data.object;
            const customerId = sub.customer;

            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('stripe_customer_id', customerId)
                .single();

            if (profile) {
                const status = sub.status === 'active' ? 'active'
                    : sub.status === 'past_due' ? 'past_due'
                        : 'canceled';

                await supabase.from('profiles').update({
                    subscription_status: status,
                    subscription_period_end: sub.current_period_end
                        ? new Date(sub.current_period_end * 1000).toISOString()
                        : null,
                }).eq('id', profile.id);
            }
            break;
        }

        case 'customer.subscription.deleted': {
            const sub = event.data.object;
            const customerId = sub.customer;

            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('stripe_customer_id', customerId)
                .single();

            if (profile) {
                await supabase.from('profiles').update({
                    subscription_tier: 'free',
                    subscription_status: 'canceled',
                    stripe_subscription_id: null,
                    subscription_period_end: null,
                }).eq('id', profile.id);
            }
            break;
        }
    }

    return NextResponse.json({ received: true });
}
