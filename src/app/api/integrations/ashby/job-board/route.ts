import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/ashby/job-board
 * Authenticated proxy to Ashby jobPosting.list so the frontend can safely fetch jobs.
 *
 * Env:
 * - ASHBY_JOB_BOARD_NAME: your Ashby job board slug (e.g. "acme-inc")
 * - ASHBY_API_KEY: Ashby API key (server-side only)
 *
 * Query params:
 * - includeCompensation (optional, default: true)
 */
export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['candidate', 'platform_admin'] });
  if (authResult instanceof Response) return authResult;

  const { searchParams } = new URL(req.url);

  const boardName = process.env.ASHBY_JOB_BOARD_NAME;
  const apiKey = process.env.ASHBY_API_KEY;
  if (!boardName || !apiKey) {
    return NextResponse.json(
      { error: 'ASHBY_JOB_BOARD_NAME or ASHBY_API_KEY is not configured on the server' },
      { status: 500 },
    );
  }

  const includeCompensation =
    searchParams.get('includeCompensation') ?? 'true';

  try {
    const body = {
      jobBoardName: boardName,
      includeCompensation: includeCompensation === 'true',
    };

    const res = await fetch('https://api.ashbyhq.com/jobPosting.list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Ashby job board request failed', status: res.status, body: text },
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
      { error: 'Ashby job board request error', message },
      { status: 500 },
    );
  }
}

