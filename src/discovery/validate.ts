import type { Provider } from './patterns';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface ValidationResult {
  ok: boolean;
  status: number | null;
  error?: string;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
  maxRetries = 2
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      if (!retryable || attempt >= maxRetries) {
        clearTimeout(timer);
        return res;
      }
      const delay = Math.min(1000 * 2 ** attempt, 15_000);
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    } catch (err) {
      if (attempt >= maxRetries) {
        clearTimeout(timer);
        throw err;
      }
      const delay = Math.min(1000 * 2 ** attempt, 15_000);
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    }
  }
}

async function validateGreenhouse(token: string): Promise<ValidationResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=false`;
  try {
    const res = await fetchWithRetry(url, { timeoutMs: DEFAULT_TIMEOUT_MS });
    let ok = false;
    if (res.ok) {
      const data = await res.json().catch(() => null);
      ok = !!data && Array.isArray((data as any).jobs);
    }
    return { ok, status: res.status, error: ok ? undefined : `Unexpected response for ${url}` };
  } catch (err: any) {
    return { ok: false, status: null, error: err?.message ?? String(err) };
  }
}

async function validateLever(client: string): Promise<ValidationResult> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(client)}?mode=json`;
  try {
    const res = await fetchWithRetry(url, { timeoutMs: DEFAULT_TIMEOUT_MS });
    let ok = false;
    if (res.ok) {
      const data = await res.json().catch(() => null);
      ok = Array.isArray(data);
    }
    return { ok, status: res.status, error: ok ? undefined : `Unexpected response for ${url}` };
  } catch (err: any) {
    return { ok: false, status: null, error: err?.message ?? String(err) };
  }
}

async function validateAshby(name: string): Promise<ValidationResult> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(name)}`;
  try {
    const res = await fetchWithRetry(url, { timeoutMs: DEFAULT_TIMEOUT_MS });
    let ok = false;
    if (res.ok) {
      const data = await res.json().catch(() => null);
      ok = !!data && Array.isArray((data as any).jobs);
    }
    return { ok, status: res.status, error: ok ? undefined : `Unexpected response for ${url}` };
  } catch (err: any) {
    return { ok: false, status: null, error: err?.message ?? String(err) };
  }
}

export async function validateBoard(provider: Provider, source_org: string): Promise<ValidationResult> {
  if (provider === 'greenhouse') return validateGreenhouse(source_org);
  if (provider === 'lever') return validateLever(source_org);
  return validateAshby(source_org);
}

