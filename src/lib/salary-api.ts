import { config } from '@/config';

/**
 * Optional salary market data (e.g. Adzuna).
 * When ADZUNA_APP_ID and ADZUNA_APP_KEY are set, fetches job search results
 * for the given title/location and returns aggregate min/max/median.
 * Otherwise returns null (widget uses search-result-based insights only).
 */

const ADZUNA_APP_ID = config.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = config.ADZUNA_APP_KEY;
const ADZUNA_COUNTRY = config.ADZUNA_COUNTRY || 'gb';

export interface MarketSalaryResult {
  min: number;
  max: number;
  median: number;
  count: number;
  source: string;
}

/**
 * Fetch market salary range for a job title (and optional location) from Adzuna job listings.
 * Returns null if not configured or request fails.
 */
export async function getMarketSalary(
  title: string,
  location?: string | null
): Promise<MarketSalaryResult | null> {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY || !title.trim()) return null;

  const what = encodeURIComponent(title.trim().slice(0, 80));
  const where = location?.trim() ? `&where=${encodeURIComponent(location.trim().slice(0, 60))}` : '';
  const url = `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&what=${what}&results_per_page=50${where}&content-type=application/json`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<{ salary_min?: number; salary_max?: number }> };
    const results = data?.results ?? [];
    const withSalary = results.filter(
      (r) => typeof r.salary_min === 'number' || typeof r.salary_max === 'number'
    );
    if (withSalary.length === 0) return null;

    const mins = withSalary.map((r) => r.salary_min ?? r.salary_max ?? 0).filter((n) => n > 0);
    const maxs = withSalary.map((r) => r.salary_max ?? r.salary_min ?? 0).filter((n) => n > 0);
    const all = [...mins, ...maxs].filter((n) => n > 0);
    if (all.length === 0) return null;

    const min = Math.min(...all);
    const max = Math.max(...all);
    all.sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)] ?? min;

    return {
      min,
      max,
      median,
      count: withSalary.length,
      source: 'Adzuna',
    };
  } catch {
    return null;
  }
}

export function isSalaryApiConfigured(): boolean {
  return !!(ADZUNA_APP_ID && ADZUNA_APP_KEY);
}
