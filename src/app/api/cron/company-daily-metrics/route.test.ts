import { describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn(() => Promise.resolve({ error: null }));
const selectEqMock = vi.fn(() => Promise.resolve({ data: [{ id: 'company-1' }, { id: 'company-2' }] }));

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: selectEqMock,
      })),
    })),
    rpc: rpcMock,
  })),
}));

import { POST } from './route';

describe('POST /api/cron/company-daily-metrics', () => {
  it('fails closed when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET;
    const req = new Request('http://localhost:3000/api/cron/company-daily-metrics', { method: 'POST' });
    const res = await POST(req as never);
    expect(res.status).toBe(503);
  });

  it('rejects invalid authorization header', async () => {
    process.env.CRON_SECRET = 'correct-secret';
    const req = new Request('http://localhost:3000/api/cron/company-daily-metrics', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('processes updates with valid authorization header', async () => {
    process.env.CRON_SECRET = 'correct-secret';
    const req = new Request('http://localhost:3000/api/cron/company-daily-metrics', {
      method: 'POST',
      headers: { Authorization: 'Bearer correct-secret' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});
