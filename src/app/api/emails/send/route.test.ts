import { describe, expect, it, vi } from 'vitest';
import { buildRequest } from '@/test/helpers';

vi.mock('@/lib/api-auth', () => ({
  requireApiAuth: vi.fn(async () => ({
    user: { id: 'user-1', email: 'user@test.dev' },
    profile: { id: 'user-1', role: 'candidate', effective_role: 'candidate', company_id: null },
  })),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/email-gmail-send', () => ({
  getEmailAccountWithValidToken: vi.fn(),
  sendEmailViaGmail: vi.fn(),
}));

import { POST } from './route';

describe('POST /api/emails/send validation', () => {
  it('returns 400 for invalid email payload', async () => {
    const request = buildRequest('http://localhost:3000/api/emails/send', {
      method: 'POST',
      body: {
        to: ['not-an-email'],
        subject: '',
        body_html: '',
      },
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Validation failed');
  });
});
