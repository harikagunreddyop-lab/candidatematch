import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { buildRequest, createTestUser } from '@/test/helpers';

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({
  logAuditServer: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  apiLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { GET, POST } from './route';

describe('/api/admin/jobs', () => {
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

  it('GET returns paginated jobs list', async () => {
    const listRange = vi.fn().mockResolvedValue({
      data: [{ id: 'job-1', title: 'Senior Engineer', company: 'Acme' }],
      error: null,
    });
    const listQuery = {
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      range: listRange,
    };
    const countQuery = {
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      count: 1,
      error: null,
    };
    const fromMock = vi.fn(() => ({
      select: vi.fn((_: string, options?: { head?: boolean }) => (options?.head ? countQuery : listQuery)),
    }));
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never);

    const req = buildRequest('http://localhost:3000/api/admin/jobs?page=0&pageSize=10&source=all&q=engineer') as NextRequest;
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.totalCount).toBe(1);
    expect(data.jobs).toHaveLength(1);
    expect(listRange).toHaveBeenCalledWith(0, 9);
  });

  it('POST validates payload', async () => {
    vi.mocked(createServiceClient).mockReturnValue({ from: vi.fn() } as never);
    const req = buildRequest('http://localhost:3000/api/admin/jobs', {
      method: 'POST',
      body: { title: 'A' },
    }) as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid job payload');
  });

  it('POST creates manual job through server API', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'job-created',
        title: 'Staff Engineer',
        company: 'Acme',
        location: 'Remote',
        url: 'https://jobs.example/job/1',
        source: 'manual',
        scraped_at: new Date().toISOString(),
      },
      error: null,
    });
    const fromMock = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle,
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single,
        })),
      })),
    }));
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never);

    const req = buildRequest('http://localhost:3000/api/admin/jobs', {
      method: 'POST',
      body: {
        title: 'Staff Engineer',
        company: 'Acme',
        location: 'Remote',
        url: 'https://jobs.example/job/1',
        jd_clean: 'Role details',
      },
    }) as NextRequest;

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.job.id).toBe('job-created');
    expect(maybeSingle).toHaveBeenCalled();
    expect(single).toHaveBeenCalled();
  });
});
