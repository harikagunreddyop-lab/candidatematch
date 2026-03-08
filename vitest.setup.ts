/**
 * Vitest setup: globals, mocks, env.
 */
import { beforeAll, afterEach, vi } from 'vitest';

beforeAll(() => {
  vi.stubEnv('NODE_ENV', 'test');
});

afterEach(() => {
  vi.clearAllMocks();
});
