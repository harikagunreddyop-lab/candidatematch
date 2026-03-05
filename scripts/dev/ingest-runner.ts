/**
 * Dev-only scheduled job board ingest runner.
 *
 * This script is NOT deployed to AWS Amplify. It is intended for local
 * development only (e.g. `npm run ingest:run`) and mirrors the logic used
 * by `/api/cron/ingest` and `/api/admin/maintenance/ingest`.
 */

import 'dotenv/config';
import { createServiceClient } from '@/lib/supabase-server';
import { syncConnector } from '@/ingest/sync';
import { log, error as logError } from '@/lib/logger';

const CONCURRENCY = 4;
const POLL_INTERVAL_MS = 60_000;

async function getDueConnectors(): Promise<Array<{ id: string; provider: string; source_org: string }>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('ingest_connectors')
    .select('id, provider, source_org, sync_interval_min, last_run_at')
    .eq('is_enabled', true);

  if (error) {
    logError('[INGEST-RUNNER] Failed to fetch connectors:', error.message);
    return [];
  }

  const now = Date.now();
  const due = (data ?? []).filter((row: Record<string, unknown>) => {
    const intervalMin = (row.sync_interval_min as number) ?? 60;
    const lastRun = row.last_run_at as string | null | undefined;
    if (!lastRun) return true;
    const elapsed = (now - new Date(lastRun).getTime()) / 60_000;
    return elapsed >= intervalMin;
  });

  return due.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    provider: r.provider as string,
    source_org: r.source_org as string,
  }));
}

async function runSyncBatch(connectors: Array<{ id: string; provider: string; source_org: string }>) {
  const run = async (c: { id: string; provider: string; source_org: string }) => {
    try {
      const result = await syncConnector(c.id);
      log(`[INGEST-RUNNER] ${c.provider}/${c.source_org}: fetched=${result.fetched} upserted=${result.upserted} closed=${result.closed}`);
    } catch (err: unknown) {
      logError(`[INGEST-RUNNER] ${c.provider}/${c.source_org} failed:`, err);
    }
  };

  for (let i = 0; i < connectors.length; i += CONCURRENCY) {
    const batch = connectors.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(run));
  }
}

async function tick() {
  const due = await getDueConnectors();
  if (due.length === 0) {
    log('[INGEST-RUNNER] No connectors due');
    return;
  }
  log(`[INGEST-RUNNER] Syncing ${due.length} connector(s)`);
  await runSyncBatch(due);
}

async function main() {
  log('[INGEST-RUNNER] Starting (DEV ONLY; poll interval: 60s, concurrency: ' + CONCURRENCY + ')');
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

main().catch((err) => {
  logError('[INGEST-RUNNER] Fatal:', err);
  process.exit(1);
});

