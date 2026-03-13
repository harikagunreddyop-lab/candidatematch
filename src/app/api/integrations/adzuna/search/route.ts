import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/adzuna/search
 * Admin-only proxy to Adzuna jobs search API so the platform can ingest external jobs.
 *
 * Env:
 * - ADZUNA_APP_ID
 * - ADZUNA_APP_KEY
 * - ADZUNA_COUNTRY (e.g. "gb", "us")
 *
 * Query params (proxied to Adzuna where applicable):
 * - what: search term (e.g. "javascript developer")
 * - where: location (optional)
 * - page: page number (default 1)
 * - results_per_page: per-page results (default 20)
 */
export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin'] });
  if (authResult instanceof Response) return authResult;

  const { searchParams } = new URL(req.url);

  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  const country = process.env.ADZUNA_COUNTRY || 'gb';

  if (!appId || !appKey) {
    return NextResponse.json(
      { error: 'ADZUNA_APP_ID or ADZUNA_APP_KEY is not configured on the server' },
      { status: 500 },
    );
  }

  const what = searchParams.get('what') ?? '';
  const where = searchParams.get('where') ?? '';
  const page = searchParams.get('page') ?? '1';
  const resultsPerPage = searchParams.get('results_per_page') ?? '20';

  const adzunaUrl = new URL(
    `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${encodeURIComponent(page)}`,
  );
  adzunaUrl.searchParams.set('app_id', appId);
  adzunaUrl.searchParams.set('app_key', appKey);
  adzunaUrl.searchParams.set('results_per_page', resultsPerPage);
  adzunaUrl.searchParams.set('content-type', 'application/json');
  if (what) adzunaUrl.searchParams.set('what', what);
  if (where) adzunaUrl.searchParams.set('where', where);

  try {
    const res = await fetch(adzunaUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Adzuna request failed', status: res.status, body: text },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Adzuna request error', message },
      { status: 500 },
    );
  }
}

