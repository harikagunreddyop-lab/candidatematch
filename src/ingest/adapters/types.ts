import { createHash } from 'crypto';

export type Provider = 'greenhouse' | 'lever' | 'ashby';

export interface Connector {
  id: string;
  provider: Provider;
  source_org: string;
  is_enabled: boolean;
  sync_interval_min: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface CanonicalJob {
  provider: Provider;
  source_org: string;
  source_job_id: string;
  title: string;
  location_raw: string | null;
  department: string | null;
  job_url: string | null;
  apply_url: string;
  description_text: string;
  description_html: string | null;
  posted_at: string | null;
  updated_at: string | null;
  content_hash: string;
  raw_payload: Record<string, unknown>;
}

export interface ListItem {
  id: string;
  updatedAt?: string;
  raw?: Record<string, unknown>;
}

export interface PublicJobsAdapter {
  list(conn: Connector): Promise<ListItem[]>;
  detail(conn: Connector, item: ListItem): Promise<Record<string, unknown>>;
  normalize(conn: Connector, raw: Record<string, unknown>): CanonicalJob;
}

const DEFAULT_FETCH_TIMEOUT_MS = 15000;

export function stripHtml(html: string): string {
  if (typeof html !== 'string' || !html.trim()) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function contentHash(job: {
  title: string;
  location_raw: string | null;
  department: string | null;
  description_text: string;
  apply_url: string;
  updated_at: string | null;
}): string {
  const desc = (job.description_text || '').slice(0, 5000);
  const parts = [job.title || '', job.location_raw || '', job.department || '', desc, job.apply_url || '', job.updated_at || ''];
  return sha256(parts.join('|'));
}

export async function fetchWithRetry(url: string, options: RequestInit & { timeoutMs?: number } = {}, maxRetries = 3): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, ...init } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let lastResponse: Response | null = null;
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      if (!retryable || attempt === maxRetries) return res;
      lastResponse = res;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    } catch (err) {
      clearTimeout(timeout);
      if (attempt === maxRetries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
  return lastResponse!;
}
