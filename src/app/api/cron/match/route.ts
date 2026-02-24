import { NextRequest, NextResponse } from 'next/server';
import { runMatching } from '@/lib/matching';
import { log, error as logError } from '@/lib/logger';
import { createServiceClient } from '@/lib/supabase-server';

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

  const supabase = createServiceClient();
  let runId: string | null = null;
  try {
    const { data: row } = await supabase
      .from('cron_run_history')
      .insert({ started_at: startedAt.toISOString(), status: 'running', mode: 'incremental' })
      .select('id')
      .single();
    runId = row?.id ?? null;
  } catch (_) {}

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
    let finalResult = result;
    let mode = 'incremental';

    if (result.total_matches_upserted === 0 && result.candidates_processed > 0 && noNewJobs) {
      log('[CRON] No new jobs matched in window — running full match as fallback');
      finalResult = await runMatching(
        undefined,
        (msg) => log(`[CRON-FULL] ${msg}`),
      );
      mode = 'full_fallback';
    }

    const endedAt = new Date();
    if (runId) {
      await supabase
        .from('cron_run_history')
        .update({
          ended_at: endedAt.toISOString(),
          status: 'ok',
          mode,
          candidates_processed: finalResult.candidates_processed ?? 0,
          total_matches_upserted: finalResult.total_matches_upserted ?? 0,
        })
        .eq('id', runId);
    }

    const elapsed = Date.now() - startedAt.getTime();
    return NextResponse.json({
      ok: true,
      mode,
      jobs_since: jobsSince,
      elapsed_ms: elapsed,
      run_id: runId,
      ...finalResult,
    });
  } catch (err: any) {
    logError('[CRON] Match run failed:', err);
    if (runId) {
      await supabase
        .from('cron_run_history')
        .update({
          ended_at: new Date().toISOString(),
          status: 'failed',
          error_message: err.message?.slice(0, 1000) ?? String(err),
        })
        .eq('id', runId);
    }
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 },
    );
  }
}
