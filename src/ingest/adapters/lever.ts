/**
 * Lever Postings API adapter.
 */

import type { CanonicalJob, Connector, ListItem, PublicJobsAdapter } from './types';
import { stripHtml, contentHash, fetchWithRetry } from './types';

export const lever: PublicJobsAdapter = {
  async list(conn: Connector): Promise<ListItem[]> {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(conn.source_org)}?mode=json`;
    const res = await fetchWithRetry(url, { timeoutMs: 20000 });
    if (!res.ok) {
      throw new Error(`Lever API error: ${res.status} ${res.statusText}`);
    }
    const jobs = (await res.json()) as unknown[];
    if (!Array.isArray(jobs)) return [];
    return jobs.map((j) => {
      const r = j as Record<string, unknown>;
      return {
        id: String(r.id ?? ''),
        updatedAt: typeof r.updatedAt === 'number'
          ? new Date(r.updatedAt).toISOString()
          : (typeof r.updatedAt === 'string' ? r.updatedAt : undefined),
        raw: r,
      };
    });
  },

  async detail(conn: Connector, item: ListItem): Promise<Record<string, unknown>> {
    if (item.raw && typeof item.raw === 'object') return item.raw;
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(conn.source_org)}/${encodeURIComponent(item.id)}?mode=json`;
    const res = await fetchWithRetry(url, { timeoutMs: 15000 });
    if (!res.ok) throw new Error(`Lever job detail error: ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  },

  normalize(conn: Connector, raw: Record<string, unknown>): CanonicalJob {
    const title = (String(raw.text ?? raw.title ?? '').trim()) || 'Untitled';
    const categories = raw.categories as Record<string, string> | undefined;
    const location_raw = categories?.location ? String(categories.location).trim() : null;
    const department = (categories?.team ?? categories?.department ?? null) as string | null;
    const hostedUrl = String(raw.hostedUrl ?? '').trim() || null;
    const applyUrl = String(raw.applyUrl ?? '').trim() || hostedUrl;
    const apply_url = applyUrl || 'about:blank';
    const descHtml = String(raw.description ?? '').trim();
    const description_text = stripHtml(descHtml) || title;
    const description_html = descHtml || null;
    const createdAt = raw.createdAt;
    const updatedAt = raw.updatedAt;
    const posted_at = createdAt != null
      ? (typeof createdAt === 'number' ? new Date(createdAt).toISOString() : String(createdAt))
      : null;
    const updated_at = updatedAt != null
      ? (typeof updatedAt === 'number' ? new Date(updatedAt).toISOString() : String(updatedAt))
      : posted_at;
    const source_job_id = String(raw.id ?? '');

    return {
      provider: 'lever',
      source_org: conn.source_org,
      source_job_id,
      title,
      location_raw,
      department,
      job_url: hostedUrl,
      apply_url,
      description_text,
      description_html,
      posted_at,
      updated_at,
      content_hash: contentHash({
        title,
        location_raw,
        department,
        description_text,
        apply_url,
        updated_at,
      }),
      raw_payload: raw,
    };
  },
};
