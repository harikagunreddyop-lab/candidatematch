/**
 * Test helpers for unit and integration tests.
 * Use createTestUser/createTestCompany for mock auth context; buildRequest for API route tests.
 */

export interface TestCompany {
  id: string;
  name: string;
}

export interface TestUser {
  id: string;
  email: string;
  company_id: string | null;
  role: 'platform_admin' | 'company_admin' | 'recruiter' | 'candidate';
}

let companyCounter = 0;
let userCounter = 0;

export function createTestCompany(overrides?: Partial<TestCompany>): TestCompany {
  companyCounter += 1;
  return {
    id: `company-${companyCounter}-${Date.now()}`,
    name: `Test Company ${companyCounter}`,
    ...overrides,
  };
}

export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  userCounter += 1;
  const company = overrides?.company_id != null ? undefined : createTestCompany();
  return {
    id: `user-${userCounter}-${Date.now()}`,
    email: `user${userCounter}@test.example`,
    company_id: overrides?.company_id ?? company?.id ?? null,
    role: 'company_admin',
    ...overrides,
  };
}

/**
 * Build a NextRequest for API route tests.
 */
export function buildRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Request {
  const { method = 'GET', headers = {}, body } = options;
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body !== undefined && method !== 'GET') {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

/**
 * Reset internal counters (call in beforeEach if you need deterministic IDs).
 */
export function resetTestCounters(): void {
  companyCounter = 0;
  userCounter = 0;
}
