/**
 * Stripe API service — create customer, checkout, portal, subscription helpers.
 * Uses STRIPE_SECRET_KEY from env; returns null / throws when not configured.
 * Use from API routes only (Node).
 */

const STRIPE_API = 'https://api.stripe.com/v1';

function getSecret(): string | null {
  return process.env.STRIPE_SECRET_KEY ?? null;
}

async function stripeFetch(
  path: string,
  options: { method?: string; body?: URLSearchParams } = {}
): Promise<Record<string, unknown>> {
  const secret = getSecret();
  if (!secret) throw new Error('Stripe not configured');
  const { method = 'GET', body } = options;
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body && { 'Content-Type': 'application/x-www-form-urlencoded' }),
    },
    ...(body && { body: body.toString() }),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown> & { error?: { message?: string } };
  if (data.error) throw new Error((data.error as { message?: string }).message ?? 'Stripe API error');
  return data;
}

export interface CreateCustomerParams {
  name: string;
  metadata?: Record<string, string>;
}

/** Create a Stripe customer. Returns customer id. */
export async function createCustomer(params: CreateCustomerParams): Promise<string> {
  const body = new URLSearchParams({
    name: params.name,
    ...(params.metadata && Object.fromEntries(
      Object.entries(params.metadata).map(([k, v]) => [`metadata[${k}]`, v])
    )),
  });
  const customer = await stripeFetch('/customers', { method: 'POST', body }) as { id: string };
  return customer.id;
}

export interface CreateCheckoutSessionParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  mode?: 'subscription' | 'payment';
  metadata?: Record<string, string>;
}

/** Create a Stripe Checkout session. Returns session with url. */
export async function createCheckoutSession(params: CreateCheckoutSessionParams): Promise<{ url: string; id: string }> {
  const body = new URLSearchParams({
    mode: params.mode ?? 'subscription',
    customer: params.customerId,
    'line_items[0][price]': params.priceId,
    'line_items[0][quantity]': '1',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    ...(params.metadata && Object.fromEntries(
      Object.entries(params.metadata).map(([k, v]) => [`metadata[${k}]`, v])
    )),
  });
  const session = await stripeFetch('/checkout/sessions', { method: 'POST', body }) as { url: string; id: string };
  return { url: session.url, id: session.id };
}

export interface CreateBillingPortalSessionParams {
  customerId: string;
  returnUrl: string;
}

/** Create a Stripe Billing Portal session. Returns url. */
export async function createBillingPortalSession(params: CreateBillingPortalSessionParams): Promise<string> {
  const body = new URLSearchParams({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  const portal = await stripeFetch('/billing_portal/sessions', { method: 'POST', body }) as { url: string };
  return portal.url;
}

/** Retrieve a subscription by id. */
export async function getSubscription(subscriptionId: string): Promise<{
  id: string;
  status: string;
  current_period_end: number;
  current_period_start: number;
} | null> {
  try {
    const sub = await stripeFetch(`/subscriptions/${subscriptionId}`) as {
      id: string;
      status: string;
      current_period_end: number;
      current_period_start: number;
    };
    return sub;
  } catch {
    return null;
  }
}

/** Cancel a subscription at period end. */
export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ cancel_at_period_end: 'true' });
    await stripeFetch(`/subscriptions/${subscriptionId}`, { method: 'POST', body });
    return true;
  } catch {
    return false;
  }
}

/** Check if Stripe is configured. */
export function isStripeConfigured(): boolean {
  return !!getSecret();
}
