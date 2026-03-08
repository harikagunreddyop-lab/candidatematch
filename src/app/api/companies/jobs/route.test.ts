/**
 * Integration tests for POST /api/companies/jobs.
 * Mocks auth, Supabase, feature gates, and rate limits.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestUser, createTestCompany, buildRequest } from '@/test/helpers';
import type { NextRequest } from 'next/server';

// Mock all dependencies before importing the route
vi.mock('@/lib/api-auth', () => ({
  requireApiAuth: vi.fn(),
}));
vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}));
vi.mock('@/lib/feature-gates', () => ({
  checkCompanyFeatureAccess: vi.fn(),
}));
vi.mock('@/lib/ratelimit-upstash', () => ({
  checkRateLimit: vi.fn(),
  strictRateLimit: {},
}));
vi.mock('@/lib/redis', () => ({
  invalidateCache: vi.fn(),
}));
vi.mock('@/lib/analytics-posthog-server', () => ({
  captureServerEvent: vi.fn(),
  AnalyticsEvents: { JOB_CREATED: 'job_created' },
}));
vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn(),
  getClientIp: vi.fn(() => null),
}));
vi.mock('@/lib/errors', () => ({
  handleAPIError: vi.fn((e: unknown) => {
    throw e;
  }),
}));

import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { checkCompanyFeatureAccess } from '@/lib/feature-gates';
import { checkRateLimit } from '@/lib/ratelimit-upstash';
import { POST } from './route';

describe('POST /api/companies/jobs', () => {
  const company = createTestCompany();
  const user = createTestUser({ company_id: company.id, role: 'company_admin' });

  const mockSupabase = {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: {
                id: 'job-1',
                title: 'Senior Engineer',
                company: 'Test Company',
                is_active: true,
              },
              error: null,
            })
          ),
        })),
      })),
    })),
  };

  beforeEach(() => {
    vi.mocked(requireApiAuth).mockResolvedValue({
      user: { id: user.id, email: user.email },
      profile: {
        id: user.id,
        role: 'admin',
        effective_role: 'company_admin',
        company_id: company.id,
      },
      supabase: mockSupabase as never,
    });
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);
    vi.mocked(checkCompanyFeatureAccess).mockResolvedValue({
      allowed: true,
      current: 5,
      limit: 10,
    });
    vi.mocked(checkRateLimit).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60000,
    });
  });

  it('should create job successfully', async () => {
    const request = buildRequest('http://localhost:3000/api/companies/jobs', {
      method: 'POST',
      body: {
        title: 'Senior Engineer',
        company: company.name,
        description: 'We are hiring...',
      },
    }) as unknown as NextRequest;

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.job).toBeDefined();
    expect(data.job.title).toBe('Senior Engineer');
  });

  it('should require authentication', async () => {
    vi.mocked(requireApiAuth).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }) as never
    );

    const request = buildRequest('http://localhost:3000/api/companies/jobs', {
      method: 'POST',
      body: {},
    }) as unknown as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('should require title in body', async () => {
    const request = buildRequest('http://localhost:3000/api/companies/jobs', {
      method: 'POST',
      body: { company: 'Acme' },
    }) as unknown as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});
