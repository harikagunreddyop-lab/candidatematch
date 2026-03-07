/**
 * Adzuna API adapter.
 * source_org = country code (gb, us, au, de, etc.)
 * Requires ADZUNA_APP_ID and ADZUNA_APP_KEY env vars.
 */

import type { CanonicalJob, Connector, ListItem, PublicJobsAdapter } from './types';
import { stripHtml, contentHash, fetchWithRetry } from './types';

const DEFAULT_WHAT = 'developer';
const RESULTS_PER_PAGE = 50;
const MAX_PAGES = 20;

function getAdzunaCreds(): { appId: string; appKey: string } | null {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) return null;
  return { appId, appKey };
}

export const adzuna: PublicJobsAdapter = {
  async list(conn: Connector): Promise<ListItem[]> {
    const creds = getAdzunaCreds();
    if (!creds) {
      throw new Error('ADZUNA_APP_ID and ADZUNA_APP_KEY must be set for Adzuna connector');
    }

    const country = (conn.source_org || 'gb').toLowerCase();
    const items: ListItem[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
      url.searchParams.set('app_id', creds.appId);
      url.searchParams.set('app_key', creds.appKey);
      url.searchParams.set('results_per_page', String(RESULTS_PER_PAGE));
      url.searchParams.set('what', DEFAULT_WHAT);
      url.searchParams.set('content-type', 'application/json');

      const res = await fetchWithRetry(url.toString(), { timeoutMs: 15000 });
      if (!res.ok) throw new Error(`Adzuna API error: ${res.status} ${res.statusText}`);

      const data = (await res.json()) as { results?: unknown[] };
      const results = Array.isArray(data.results) ? data.results : [];
      if (!results.length) break;

      for (const j of results) {
        const r = j as Record<string, unknown>;
        const id = String(r.id ?? '');
        if (!id) continue;
        items.push({
          id,
          updatedAt: typeof r.created === 'string' ? r.created : undefined,
          raw: r,
        });
      }

      if (results.length < RESULTS_PER_PAGE) break;
    }

    return items;
  },

  async detail(conn: Connector, item: ListItem): Promise<Record<string, unknown>> {
    if (item.raw && typeof item.raw === 'object') return item.raw;
    // Adzuna search returns full job objects; no separate detail call
    return {};
  },

  normalize(conn: Connector, raw: Record<string, unknown>): CanonicalJob {
    const title = (String(raw.title ?? '').trim()) || 'Untitled';
    const company = raw.company as { display_name?: string } | undefined;
    const companyName = company?.display_name ? String(company.display_name).trim() : conn.source_org;
    const location = raw.location as { display_name?: string } | undefined;
    const location_raw = location?.display_name ? String(location.display_name).trim() : null;
    const description = String(raw.description ?? '').trim();
    const description_text = stripHtml(description) || title;
    const redirect_url = String(raw.redirect_url ?? '').trim() || null;
    const apply_url = redirect_url || 'about:blank';
    const created = raw.created;
    const updated_at = typeof created === 'string' ? created : null;

    // Adzuna uses id as string
    const source_job_id = String(raw.id ?? '');

    return {
      provider: 'adzuna',
      source_org: conn.source_org,
      source_job_id,
      title,
      location_raw,
      department: null,
      job_url: redirect_url,
      apply_url,
      description_text,
      description_html: description || null,
      posted_at: updated_at,
      updated_at,
      content_hash: contentHash({
        title,
        location_raw,
        department: null,
        description_text,
        apply_url,
        updated_at,
      }),
      raw_payload: raw,
    };
  },
};
