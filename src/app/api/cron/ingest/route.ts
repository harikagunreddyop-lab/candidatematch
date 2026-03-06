/**
 * GET /api/cron/ingest
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTENDED CALLER: AWS EventBridge Scheduler (every hour).
 * See docs/CRON_AMPLIFY.md for full setup instructions.
 *
 * This endpoint does NOT run by itself — it must be called externally.
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * For manual on-demand ingest, use:
 *   POST /api/connectors/sync-all  (admin JWT)
 *   POST /api/connectors/{id}/sync (admin JWT, single connector)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { structuredLog } from '@/lib/logger';
import { validateCronAuth } from '@/lib/security';
import { syncAllConnectors } from '@/ingest/sync-v2';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const callerIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  const userAgent = req.headers.get('user-agent') ?? 'unknown';

  structuredLog('info', 'cron ingest called', {
    caller_ip: callerIp,
    user_agent: userAgent,
    started_at: new Date().toISOString(),
  });

  if (!validateCronAuth(req)) {
    structuredLog('warn', 'cron ingest unauthorized', { caller_ip: callerIp, user_agent: userAgent });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  structuredLog('info', 'cron ingest run started (v2 engine)');

  const supabase = createServiceClient();

  // Write cron_run_history for auditability
  let runId: string | null = null;
  try {
    const { data: row } = await supabase
      .from('cron_run_history')
      .insert({
        started_at: new Date(startedAt).toISOString(),
        status: 'running',
        mode: 'cron_ingest',
      })
      .select('id')
      .single();
    runId = row?.id ?? null;
  } catch {
    // best-effort only
  }

  try {
    const results = await syncAllConnectors();

    const elapsed = Date.now() - startedAt;

    const totals = results.reduce(
      (acc, r) => ({
        fetched: acc.fetched + r.fetched,
        upserted: acc.upserted + r.upserted,
        promoted: acc.promoted + r.promoted,
        skipped: acc.skipped + r.skipped,
      }),
      { fetched: 0, upserted: 0, promoted: 0, skipped: 0 }
    );

    if (runId) {
      await supabase
        .from('cron_run_history')
        .update({
          ended_at: new Date().toISOString(),
          status: 'ok',
          mode: 'cron_ingest',
          candidates_processed: results.length,
          total_matches_upserted: totals.promoted,
        })
        .eq('id', runId);
    }

    return NextResponse.json({
      success: true,
      connectors: results.length,
      ...totals,
      elapsed_ms: elapsed,
      run_id: runId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    structuredLog('error', 'cron ingest run failed', { error: String(error) });

    if (runId) {
      await supabase
        .from('cron_run_history')
        .update({
          ended_at: new Date().toISOString(),
          status: 'failed',
          mode: 'cron_ingest',
          error_message: String(error),
        })
        .eq('id', runId);
    }

    return NextResponse.json(
      { error: 'Ingest failed', details: String(error) },
      { status: 500 }
    );
  }
}
