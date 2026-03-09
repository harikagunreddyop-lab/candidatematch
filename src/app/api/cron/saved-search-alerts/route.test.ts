import { describe, expect, it, vi, beforeEach } from 'vitest';

const { sendEmailMock, templateSavedSearchAlertMock, createServiceClientMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async () => ({ id: 'email-1' })),
  templateSavedSearchAlertMock: vi.fn(() => ({ subject: 'Saved search alert', html: '<p>hi</p>' })),
  createServiceClientMock: vi.fn(),
}));

vi.mock('@/lib/email-service', () => ({
  sendEmail: sendEmailMock,
  templateSavedSearchAlert: templateSavedSearchAlertMock,
}));

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: createServiceClientMock,
}));

function makeSkipSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'candidate_saved_searches') throw new Error(`unexpected table ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            not: vi.fn(async () => ({
              data: [
                {
                  id: 'search-1',
                  candidate_id: 'cand-1',
                  search_name: 'Remote React',
                  search_params: { query: 'react' },
                  alert_frequency: 'daily',
                  last_notified_at: new Date().toISOString(),
                },
              ],
              error: null,
            })),
          })),
        })),
      };
    }),
  };
}

function makeDedupeSupabase() {
  const upsertMock = vi.fn(async () => ({ error: null }));
  const updateEqMock = vi.fn(async () => ({ error: null }));

  return {
    upsertMock,
    updateEqMock,
    from: vi.fn((table: string) => {
      if (table === 'candidate_saved_searches') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(async () => ({
                data: [
                  {
                    id: 'search-1',
                    candidate_id: 'cand-1',
                    search_name: 'Remote React',
                    search_params: {},
                    alert_frequency: 'instant',
                    last_notified_at: null,
                  },
                ],
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: updateEqMock,
          })),
        };
      }
      if (table === 'candidates') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { user_id: 'user-1' } })),
            })),
          })),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { email: 'candidate@example.com', name: 'Candidate' } })),
            })),
          })),
        };
      }
      if (table === 'jobs') {
        const q: any = {
          select: vi.fn(() => q),
          eq: vi.fn(() => q),
          or: vi.fn(() => q),
          ilike: vi.fn(() => q),
          in: vi.fn(() => q),
          overlaps: vi.fn(() => q),
          gte: vi.fn(() => q),
          order: vi.fn(() => q),
          limit: vi.fn(async () => ({
            data: [
              {
                id: 'job-1',
                title: 'Software Engineer',
                company: 'Acme',
                location: 'Remote',
                url: 'https://example.com/jobs/1',
                scraped_at: new Date().toISOString(),
              },
            ],
            error: null,
          })),
        };
        return q;
      }
      if (table === 'candidate_job_alert_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn(async () => ({
                    data: [{ job_id: 'job-1' }],
                    error: null,
                  })),
                })),
              })),
            })),
          })),
          upsert: upsertMock,
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe('POST /api/cron/saved-search-alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'correct-secret';
  });

  it('skips daily alerts when last_notified_at is recent', async () => {
    createServiceClientMock.mockReturnValue(makeSkipSupabase());
    const { POST } = await import('./route');

    const req = new Request('http://localhost:3000/api/cron/saved-search-alerts', {
      method: 'POST',
      headers: { Authorization: 'Bearer correct-secret' },
    });

    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sent).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does not resend email when email event already exists for job', async () => {
    const supabase = makeDedupeSupabase();
    createServiceClientMock.mockReturnValue(supabase);
    const { POST } = await import('./route');

    const req = new Request('http://localhost:3000/api/cron/saved-search-alerts', {
      method: 'POST',
      headers: { Authorization: 'Bearer correct-secret' },
    });

    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sent).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(supabase.upsertMock).toHaveBeenCalledTimes(0);
    expect(supabase.updateEqMock).toHaveBeenCalledTimes(1); // last_notified_at still updated
  });
});
