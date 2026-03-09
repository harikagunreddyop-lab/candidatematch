/**
 * Vitest setup: globals, mocks, env.
 */
import { beforeAll, afterEach, vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

beforeAll(() => {
  vi.stubEnv('NODE_ENV', 'test');
});

afterEach(() => {
  vi.clearAllMocks();
});
