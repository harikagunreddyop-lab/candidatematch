/**
 * Cron: sync due Type-B ingest connectors.
 * Call every hour (or as configured in vercel.json) to auto-ingest jobs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { syncConnector } from '@/ingest/sync';
import { log, error as logError } from '@/lib/logger';
import { validateCronAuth } from '@/lib/security';

const CONCURRENCY = 4;

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!validateCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  log('[CRON-INGEST] Starting scheduled ingest run');

  const supabase = createServiceClient();
  const { data: connectors, error: fetchErr } = await supabase
    .from('ingest_connectors')
    .select('id, provider, source_org, sync_interval_min, last_run_at')
    .eq('is_enabled', true);

  if (fetchErr) {
    logError('[CRON-INGEST] Failed to fetch connectors:', fetchErr.message);
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
    log('[CRON-INGEST] No connectors due');
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
          log(`[CRON-INGEST] ${result.provider}/${result.sourceOrg}: fetched=${result.fetched} promoted=${result.promoted}`);
        } catch (err: unknown) {
          logError(`[CRON-INGEST] ${c.provider}/${c.source_org} failed:`, err);
        }
      })
    );
  }

  const elapsed = Date.now() - startedAt;
  return NextResponse.json({
    ok: true,
    synced: results.length,
    results,
    elapsed_ms: elapsed,
  });
}
