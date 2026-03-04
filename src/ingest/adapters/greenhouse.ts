import type { CanonicalJob, Connector, ListItem, PublicJobsAdapter } from './types';
import { stripHtml, contentHash, fetchWithRetry } from './types';

export const greenhouse: PublicJobsAdapter = {
  async list(conn: Connector): Promise<ListItem[]> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(conn.source_org)}/jobs?content=true`;
    const res = await fetchWithRetry(url, { timeoutMs: 20000 });
    if (!res.ok) throw new Error(`Greenhouse API error: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { jobs?: Array<Record<string, unknown>> };
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    return jobs.map((j) => ({
      id: String((j.id as number) ?? ''),
      updatedAt: typeof j.updated_at === 'string' ? j.updated_at : undefined,
      raw: j as Record<string, unknown>,
    }));
  },

  async detail(conn: Connector, item: ListItem): Promise<Record<string, unknown>> {
    if (item.raw && typeof item.raw === 'object') return item.raw;
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(conn.source_org)}/jobs/${encodeURIComponent(item.id)}`;
    const res = await fetchWithRetry(url, { timeoutMs: 15000 });
    if (!res.ok) throw new Error(`Greenhouse job detail error: ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  },

  normalize(conn: Connector, raw: Record<string, unknown>): CanonicalJob {
    const title = String(raw.title ?? '').trim() || 'Untitled';
    const location = raw.location as { name?: string } | undefined;
    const location_raw = location?.name ? String(location.name).trim() : null;
    const absolute_url = String(raw.absolute_url ?? '').trim() || null;
    const apply_url = absolute_url || 'about:blank';
    const contentHtml = String(raw.content ?? '').trim();
    const description_text = stripHtml(contentHtml) || title;
    const description_html = contentHtml || null;
    const updated_at = typeof raw.updated_at === 'string' ? raw.updated_at : null;
    const source_job_id = String(raw.id ?? '');
    return {
      provider: 'greenhouse',
      source_org: conn.source_org,
      source_job_id,
      title,
      location_raw,
      department: null,
      job_url: absolute_url,
      apply_url,
      description_text,
      description_html,
      posted_at: null,
      updated_at,
      content_hash: contentHash({ title, location_raw, department: null, description_text, apply_url, updated_at }),
      raw_payload: raw,
    };
  },
};
