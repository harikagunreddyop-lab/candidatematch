import { NextRequest, NextResponse } from 'next/server';
import { runMatching } from '@/lib/matching';
import { structuredLog } from '@/lib/logger';
import { createServiceClient } from '@/lib/supabase-server';
import { validateCronAuth } from '@/lib/security';

/**
 * GET /api/cron/match
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTENDED CALLER: AWS EventBridge Scheduler (every 6 hours).
 * See docs/CRON_AMPLIFY.md for full setup instructions.
 *
 * This endpoint does NOT run by itself — it must be called externally.
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * For manual on-demand matching, use:
 *   GET /api/matches           (admin JWT, returns JSON)
 *   POST /api/matches          (admin JWT, streaming SSE)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const INTERVAL_HOURS = 6;
// Bail out at 250s (83% of 300s maxDuration) — write partial status before
// Amplify/Lambda hard-kills the function at 300s.
const TIMEOUT_GUARD_MS = 250_000;

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const callerIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  const userAgent = req.headers.get('user-agent') ?? 'unknown';

  structuredLog('info', 'cron match called', {
    caller_ip: callerIp,
    user_agent: userAgent,
    started_at: new Date().toISOString(),
  });

  if (!validateCronAuth(req)) {
    structuredLog('warn', 'cron match unauthorized', { caller_ip: callerIp, user_agent: userAgent });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date();
  const supabase = createServiceClient();
  let runId: string | null = null;

  try {
    const { data: row } = await supabase
      .from('cron_run_history')
      .insert({ started_at: startedAt.toISOString(), status: 'running', mode: 'incremental' })
      .select('id')
      .single();
    runId = row?.id ?? null;
  } catch (_) { }

  structuredLog('info', 'cron match run started', { run_id: runId, mode: 'incremental' });

  try {
    const jobsSince = new Date(
      Date.now() - INTERVAL_HOURS * 60 * 60 * 1000
    ).toISOString();

    const result = await runMatching(
      undefined,
      (msg) => structuredLog('info', msg, { run_id: runId }),
      { jobsSince },
    );

    // Timeout guard: stop before the function is forcibly killed
    const elapsed = Date.now() - startedAt.getTime();
    if (elapsed > TIMEOUT_GUARD_MS) {
      structuredLog('warn', 'cron match approaching timeout — writing partial status', { run_id: runId, elapsed_ms: elapsed });
      if (runId) {
        await supabase.from('cron_run_history').update({
          partial_at: new Date().toISOString(),
          status: 'partial',
          mode: 'incremental',
          candidates_processed: result.candidates_processed ?? 0,
          total_matches_upserted: result.total_matches_upserted ?? 0,
        }).eq('id', runId);
      }
      return NextResponse.json({ ok: true, mode: 'partial', elapsed_ms: elapsed, run_id: runId, ...result });
    }

    const noNewJobs = result.summary?.every((s: any) => s.status === 'Filtered' || s.matches === 0);
    let finalResult = result;
    let mode = 'incremental';

    if (result.total_matches_upserted === 0 && result.candidates_processed > 0 && noNewJobs) {
      structuredLog('info', 'no new jobs matched — running full match fallback', { run_id: runId });
      finalResult = await runMatching(undefined, (msg) => structuredLog('info', msg, { run_id: runId }));
      mode = 'full_fallback';
    }

    const endedAt = new Date();
    const totalElapsed = endedAt.getTime() - startedAt.getTime();

    if (runId) {
      await supabase.from('cron_run_history').update({
        ended_at: endedAt.toISOString(),
        status: 'ok',
        mode,
        candidates_processed: finalResult.candidates_processed ?? 0,
        total_matches_upserted: finalResult.total_matches_upserted ?? 0,
      }).eq('id', runId);
    }

    structuredLog('info', 'cron match run completed', {
      run_id: runId, mode, elapsed_ms: totalElapsed,
      candidates_processed: finalResult.candidates_processed,
      total_matches_upserted: finalResult.total_matches_upserted,
    });

    return NextResponse.json({ ok: true, mode, jobs_since: jobsSince, elapsed_ms: totalElapsed, run_id: runId, ...finalResult });
  } catch (err: any) {
    const elapsed = Date.now() - startedAt.getTime();
    structuredLog('error', 'cron match run failed', { run_id: runId, elapsed_ms: elapsed, error: err?.message });
    if (runId) {
      await supabase.from('cron_run_history').update({
        ended_at: new Date().toISOString(),
        status: 'failed',
        error_message: err.message?.slice(0, 1000) ?? String(err),
      }).eq('id', runId);
    }
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
