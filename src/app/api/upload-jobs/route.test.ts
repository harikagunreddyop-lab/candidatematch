import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { buildRequest, createTestUser } from '@/test/helpers';

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimitResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/job-url', () => ({
  isValidJobUrl: vi.fn(() => true),
}));
vi.mock('@/lib/matching', () => ({
  runMatchingForJobs: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({
  logAuditServer: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  log: vi.fn(),
  error: vi.fn(),
}));

import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { POST } from './route';

describe('POST /api/upload-jobs', () => {
  const user = createTestUser({ role: 'platform_admin' });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: user.id, email: user.email },
      profile: {
        id: user.id,
        role: 'admin',
        effective_role: 'platform_admin',
        company_id: null,
      },
      supabase: {} as never,
    });
  });

  it('returns 400 when no rows are provided', async () => {
    vi.mocked(createServiceClient).mockReturnValue({ from: vi.fn() } as never);
    const req = buildRequest('http://localhost:3000/api/upload-jobs', {
      method: 'POST',
      body: { jobs: [] },
    }) as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('No jobs provided');
  });

  it('imports valid rows and returns summary', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const single = vi.fn().mockResolvedValue({ data: { id: 'job-1' }, error: null });
    const fromMock = vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          limit: vi.fn(() => maybeSingle()),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single,
        })),
      })),
    }));
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never);

    const req = buildRequest('http://localhost:3000/api/upload-jobs', {
      method: 'POST',
      body: {
        skip_matching: true,
        jobs: [{ title: 'Engineer', company: 'Acme', job_url: 'https://jobs.example/1', description_text: 'Role' }],
      },
    }) as NextRequest;

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(typeof body.inserted).toBe('number');
    expect(body.matching.status).toBe('skipped');
  });
});
