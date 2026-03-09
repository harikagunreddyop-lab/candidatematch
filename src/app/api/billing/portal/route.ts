/**
 * POST /api/billing/portal — Create Stripe Customer Portal session
 * Allows users to manage subscription, update payment, cancel, etc.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { getAppUrl } from '@/config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
    if (authResult instanceof Response) return authResult;

    const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
    const APP_URL = getAppUrl();

    if (!STRIPE_SECRET) {
        return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const supabase = createServiceClient();
    const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', authResult.user.id)
        .single();

    if (!profile?.stripe_customer_id) {
        return NextResponse.json({ error: 'No billing account found' }, { status: 404 });
    }

    const params = new URLSearchParams({
        'customer': profile.stripe_customer_id,
        'return_url': `${APP_URL}/dashboard`,
    });

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${STRIPE_SECRET}`,
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
