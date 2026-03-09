import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('POST /api/eventbridge/ingest', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.CRON_SECRET = 'correct-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('triggers ingest and saved-search-alerts sequentially', async () => {
    vi.resetModules();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, connectors: 3 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, sent: 2 }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { POST } = await import('./route');

    const req = new Request('http://localhost:3000/api/eventbridge/ingest', {
      method: 'POST',
      headers: { Authorization: 'Bearer correct-secret' },
    });

    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/api/cron/ingest');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3000/api/cron/saved-search-alerts');
    expect(data.saved_search_alerts?.ok).toBe(true);
  });
});
