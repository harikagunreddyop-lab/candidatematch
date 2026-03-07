/**
 * POST /api/billing/checkout — Create Stripe Checkout session for Pro plan
 * Body: { interval?: 'monthly' | 'yearly' } — defaults to monthly
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
    if (authResult instanceof Response) return authResult;

    const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID;
    const STRIPE_PRO_ANNUAL_PRICE_ID = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

    if (!STRIPE_SECRET || !STRIPE_PRO_PRICE_ID) {
        return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const interval = (body.interval === 'yearly' ? 'yearly' : 'monthly') as 'monthly' | 'yearly';
    const priceId = interval === 'yearly' && STRIPE_PRO_ANNUAL_PRICE_ID
        ? STRIPE_PRO_ANNUAL_PRICE_ID
        : STRIPE_PRO_PRICE_ID;

    const supabase = createServiceClient();
    const userId = authResult.user.id;
    const userEmail = authResult.user.email;

    // Check or create Stripe customer
    const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id, subscription_tier')
        .eq('id', userId)
        .single();

    if (profile?.subscription_tier === 'pro') {
        return NextResponse.json({ error: 'Already on Pro plan' }, { status: 400 });
    }

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
        // Create Stripe customer
        const customerRes = await fetch('https://api.stripe.com/v1/customers', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${STRIPE_SECRET}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                email: userEmail || '',
                'metadata[user_id]': userId,
            }),
        });
        const customer = await customerRes.json();
        customerId = customer.id;

        await supabase.from('profiles').update({
            stripe_customer_id: customerId,
        }).eq('id', userId);
    }

    // Create checkout session
    const params = new URLSearchParams({
        'mode': 'subscription',
        'customer': customerId!,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': `${APP_URL}/dashboard?upgraded=true`,
        'cancel_url': `${APP_URL}/pricing`,
        'metadata[user_id]': userId,
    });

    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${STRIPE_SECRET}`,
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
