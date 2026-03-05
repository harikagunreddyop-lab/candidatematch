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
import { syncConnector } from '@/ingest/sync';
import { structuredLog } from '@/lib/logger';
import { validateCronAuth } from '@/lib/security';

const CONCURRENCY = 4;

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
  structuredLog('info', 'cron ingest run started');

  const supabase = createServiceClient();

  // Write cron_run_history for auditability
  let runId: string | null = null;
  try {
    const { data: row } = await supabase
      .from('cron_run_history')
      .insert({ started_at: new Date(startedAt).toISOString(), status: 'running', mode: 'cron_ingest' })
      .select('id')
      .single();
    runId = row?.id ?? null;
  } catch (_) { }

  const { data: connectors, error: fetchErr } = await supabase
    .from('ingest_connectors')
    .select('id, provider, source_org, sync_interval_min, last_run_at')
    .eq('is_enabled', true);

  if (fetchErr) {
    structuredLog('error', 'cron ingest failed to fetch connectors', { error: fetchErr.message });
    if (runId) await supabase.from('cron_run_history').update({ ended_at: new Date().toISOString(), status: 'failed', error_message: fetchErr.message }).eq('id', runId);
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }

  const now = Date.now();
  const due = (connectors ?? []).filter((row: Record<string, unknown>) => {
    const intervalMin = (row.sync_interval_min as number) ?? 60;
    const lastRun = row.last_run_at as string | null | undefined;
    if (!lastRun) return true;
    const elapsed = (now - new Date(lastRun).getTime()) / 60_000;
    return elapsed >= intervalMin;
  });

  if (due.length === 0) {
    structuredLog('info', 'cron ingest no connectors due', { total: (connectors ?? []).length });
    return NextResponse.json({ ok: true, synced: 0, skipped: (connectors ?? []).length });
  }

  const results: Array<{ provider: string; source_org: string; fetched: number; promoted: number }> = [];

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const batch = due.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (c: Record<string, unknown>) => {
        try {
          const result = await syncConnector(c.id as string);
          results.push({
            provider: result.provider,
            source_org: result.sourceOrg,
            fetched: result.fetched,
            promoted: result.promoted,
          });
          structuredLog('info', 'cron ingest connector synced', { provider: result.provider, source_org: result.sourceOrg, fetched: result.fetched, promoted: result.promoted });
        } catch (err: unknown) {
          structuredLog('error', 'cron ingest connector failed', { provider: c.provider, source_org: c.source_org, error: String(err) });
        }
      })
    );
  }

  const elapsed = Date.now() - startedAt;

  // Update cron_run_history
  if (runId) {
    await supabase.from('cron_run_history').update({
      ended_at: new Date().toISOString(),
      status: 'ok',
      mode: 'cron_ingest',
      candidates_processed: due.length,
      total_matches_upserted: results.reduce((s, r) => s + r.promoted, 0),
    }).eq('id', runId);
  }

  return NextResponse.json({
    ok: true,
    synced: results.length,
    results,
    elapsed_ms: elapsed,
    run_id: runId,
  });
}
