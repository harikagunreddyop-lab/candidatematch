import { NextRequest, NextResponse } from 'next/server';
import { runMatching } from '@/lib/matching';
import { log, error as logError } from '@/lib/logger';

const CRON_SECRET = process.env.CRON_SECRET;
const INTERVAL_HOURS = 6;

function verifyCronAuth(req: NextRequest): boolean {
  if (!CRON_SECRET) {
    logError('[CRON] CRON_SECRET env var is not set — rejecting request');
    return false;
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${CRON_SECRET}`) {
    logError('[CRON] Invalid authorization header');
    return false;
  }
  return true;
}

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date();
  log(`[CRON] Scheduled match run started at ${startedAt.toISOString()}`);

  try {
    const jobsSince = new Date(
      Date.now() - INTERVAL_HOURS * 60 * 60 * 1000
    ).toISOString();

    const result = await runMatching(
      undefined,
      (msg) => log(`[CRON] ${msg}`),
      { jobsSince },
    );

    const noNewJobs = result.summary?.every((s: any) => s.status === 'Filtered' || s.matches === 0);
    if (result.total_matches_upserted === 0 && result.candidates_processed > 0 && noNewJobs) {
      log('[CRON] No new jobs matched in window — running full match as fallback');
      const fullResult = await runMatching(
        undefined,
        (msg) => log(`[CRON-FULL] ${msg}`),
      );
      const elapsed = Date.now() - startedAt.getTime();
      return NextResponse.json({
        ok: true,
        mode: 'full_fallback',
        elapsed_ms: elapsed,
        ...fullResult,
      });
    }

    const elapsed = Date.now() - startedAt.getTime();
    return NextResponse.json({
      ok: true,
      mode: 'incremental',
      jobs_since: jobsSince,
      elapsed_ms: elapsed,
      ...result,
    });
  } catch (err: any) {
    logError('[CRON] Match run failed:', err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 },
    );
  }
}
