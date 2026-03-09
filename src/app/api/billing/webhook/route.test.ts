import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(() => ({})),
}));

import { POST } from './route';

function signStripePayload(rawBody: string, secret: string, timestamp = 1710000000): string {
  const payload = `${timestamp}.${rawBody}`;
  const signature = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('POST /api/billing/webhook', () => {
  it('rejects unsigned or invalidly signed requests', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_key';

    const req = new Request('http://localhost:3000/api/billing/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1,v1=invalid',
      },
      body: JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('accepts a valid Stripe signature', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_key';
    const rawBody = JSON.stringify({ type: 'test.event', data: { object: {} } });

    const req = new Request('http://localhost:3000/api/billing/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signStripePayload(rawBody, process.env.STRIPE_WEBHOOK_SECRET),
      },
      body: rawBody,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);
  });
});
