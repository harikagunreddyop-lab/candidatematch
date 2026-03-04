/**
 * Ashby Public Job Posting API adapter.
 * GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}
 */

import type { CanonicalJob, Connector, ListItem, PublicJobsAdapter } from './types';
import { stripHtml, contentHash, sha256, fetchWithRetry } from './types';

export const ashby: PublicJobsAdapter = {
  async list(conn: Connector): Promise<ListItem[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(conn.source_org)}`;
    const res = await fetchWithRetry(url, { timeoutMs: 20_000 });
    if (!res.ok) {
      throw new Error(`Ashby API error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { jobs?: Array<Record<string, unknown>> };
    const results = Array.isArray(data.jobs) ? data.jobs : [];
    return results.map((r) => {
      const id = String(r.id ?? r.applyUrl ?? r.jobUrl ?? sha256((String(r.title ?? '') + String(r.location ?? '')).slice(0, 200)));
      return {
        id,
        updatedAt: typeof r.publishedAt === 'string' ? r.publishedAt : undefined,
        raw: r as Record<string, unknown>,
      };
    });
  },

  async detail(conn: Connector, item: ListItem): Promise<Record<string, unknown>> {
    if (item.raw && typeof item.raw === 'object') return item.raw;
    throw new Error('Ashby list returns full postings; no detail fetch needed');
  },

  normalize(conn: Connector, raw: Record<string, unknown>): CanonicalJob {
    const title = String(raw.title ?? '').trim() || 'Untitled';
    const location_raw = raw.location ? String(raw.location).trim() : null;
    const department = (raw.department ?? raw.team ?? null) as string | null;
    const jobUrl = String(raw.jobUrl ?? raw.job_url ?? '').trim() || null;
    const applyUrl = String(raw.applyUrl ?? raw.apply_url ?? '').trim() || jobUrl;
    const apply_url = applyUrl || 'about:blank';
    const descHtml = String(raw.descriptionHtml ?? raw.description ?? '').trim();
    const descPlain = String(raw.descriptionPlain ?? raw.description ?? '').trim();
    const description_text = descPlain || stripHtml(descHtml) || title;
    const description_html = descHtml || null;
    const publishedAt = raw.publishedAt;
    const posted_at = publishedAt != null ? String(publishedAt) : null;
    const updated_at = posted_at;
    const source_job_id = String(
      raw.id ?? raw.applyUrl ?? raw.jobUrl ?? sha256((title + (location_raw ?? '')).slice(0, 200))
    );

    return {
      provider: 'ashby',
      source_org: conn.source_org,
      source_job_id,
      title,
      location_raw,
      department,
      job_url: jobUrl,
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
