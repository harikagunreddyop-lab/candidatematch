/**
 * Parallelized job ingestion sync engine (Week 1).
 *
 * Goals:
 * - Fetch job lists/details in parallel per connector
 * - Batch ingest_jobs upserts to reduce DB roundtrips
 * - Skip unchanged ingest_jobs using content_hash
 * - Keep existing promote/close semantics for reliability
 */

import pMap from 'p-map';
import chunk from 'lodash/chunk';

import { createServiceClient } from '@/lib/supabase-server';
import { log, error as logError } from '@/lib/logger';
import { adapters, type Connector, type CanonicalJob, type ListItem } from './adapters';
import { promoteIngestJobsBulk } from './promote-v2';
import { deactivateClosedJobs } from './promote';
import { queueJobRequirementsExtraction } from './queue';

export interface SyncV2Result {
  connectorId: string;
  provider: string;
  sourceOrg: string;
  fetched: number;
  upserted: number;
  closed: number;
  promoted: number;
  skipped: number;
  durationMs: number;
  error?: string;
}

const ITEM_CONCURRENCY = 50;
const CONNECTOR_CONCURRENCY = 10;
const UPSERT_BATCH_SIZE = 1000;

async function fetchAndNormalizeJobs(
  connector: Connector
): Promise<{ jobs: CanonicalJob[]; fetched: number }> {
  const adapter = adapters[connector.provider as keyof typeof adapters];
  if (!adapter) {
    throw new Error(`Unknown provider: ${connector.provider}`);
  }

  const items = await adapter.list(connector);
  const fetched = items.length;

  const normalized = await pMap(
    items,
    async (item: ListItem) => {
      try {
        const raw = await adapter.detail(connector, item);
        return adapter.normalize(connector, raw);
      } catch (err) {
        logError(
          `[INGEST V2] detail/normalize failed for ${connector.provider}/${connector.source_org} item=${item.id}:`,
          err
        );
        return null;
      }
    },
    { concurrency: ITEM_CONCURRENCY }
  );

  const jobs = normalized.filter(Boolean) as CanonicalJob[];
  return { jobs, fetched };
}

async function upsertIngestJobsBatch(
  connector: Connector,
  jobs: CanonicalJob[]
): Promise<{ upserted: number; skipped: number }> {
  if (!jobs.length) return { upserted: 0, skipped: 0 };

  const supabase = createServiceClient();

  const sourceJobIds = Array.from(new Set(jobs.map((j) => j.source_job_id)));
  const { data: existingRows, error: existingErr } = await supabase
    .from('ingest_jobs')
    .select('source_job_id, content_hash')
    .eq('provider', connector.provider)
    .eq('source_org', connector.source_org)
    .in('source_job_id', sourceJobIds);

  if (existingErr) {
    logError('[INGEST V2] fetch existing ingest_jobs failed:', existingErr.message);
  }

  const existingBySourceId = new Map<string, string>();
  for (const row of existingRows ?? []) {
    existingBySourceId.set(row.source_job_id as string, row.content_hash as string);
  }

  const toUpsert: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const job of jobs) {
    const existingHash = existingBySourceId.get(job.source_job_id);
    if (existingHash && existingHash === job.content_hash) {
      skipped++;
      continue;
    }

    toUpsert.push({
      provider: job.provider,
      source_org: job.source_org,
      source_job_id: job.source_job_id,
      title: job.title,
      location_raw: job.location_raw,
      department: job.department,
      job_url: job.job_url,
      apply_url: job.apply_url,
      description_text: job.description_text,
      description_html: job.description_html,
      posted_at: job.posted_at,
      updated_at: job.updated_at,
      status: 'open',
      content_hash: job.content_hash,
      raw_payload: job.raw_payload,
      last_seen_at: new Date().toISOString(),
    });
  }

  if (!toUpsert.length) {
    return { upserted: 0, skipped };
  }

  let upserted = 0;

  for (const batch of chunk(toUpsert, UPSERT_BATCH_SIZE)) {
    const { error: upsertErr } = await supabase
      .from('ingest_jobs')
      .upsert(batch, {
        onConflict: 'provider,source_org,source_job_id',
        ignoreDuplicates: false,
      });

    if (upsertErr) {
      logError(
        `[INGEST V2] upsert ingest_jobs batch failed for ${connector.provider}/${connector.source_org}:`,
        upsertErr.message
      );
      continue;
    }

    upserted += batch.length;
  }

  return { upserted, skipped };
}

export async function syncConnectorV2(connectorId: string): Promise<SyncV2Result> {
  const supabase = createServiceClient();
  const startedAt = Date.now();

  const { data: conn, error: connError } = await supabase
    .from('ingest_connectors')
    .select('*')
    .eq('id', connectorId)
    .single();

  if (connError || !conn) {
    const err = connError?.message ?? 'Connector not found';
    logError(`[INGEST V2] Connector ${connectorId}: ${err}`);
    throw new Error(err);
  }

  const connector = conn as Connector;

  const result: SyncV2Result = {
    connectorId,
    provider: connector.provider,
    sourceOrg: connector.source_org,
    fetched: 0,
    upserted: 0,
    closed: 0,
    promoted: 0,
    skipped: 0,
    durationMs: 0,
  };

  await supabase
    .from('ingest_connectors')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', connectorId);

  try {
    const { jobs, fetched } = await fetchAndNormalizeJobs(connector);
    result.fetched = fetched;

    const seenIds = new Set<string>(jobs.map((j) => j.source_job_id));

    const { upserted, skipped } = await upsertIngestJobsBatch(connector, jobs);
    result.upserted = upserted;
    result.skipped = skipped;

    const { data: openJobs } = await supabase
      .from('ingest_jobs')
      .select('id, source_job_id')
      .eq('provider', connector.provider)
      .eq('source_org', connector.source_org)
      .eq('status', 'open');

    const openIngestJobIds = (openJobs ?? []).map((r: { id: string }) => r.id);
    const { promoted, newJobIds } = await promoteIngestJobsBulk(supabase, openIngestJobIds);
    result.promoted = promoted;

    if (newJobIds.length > 0) {
      try {
        await queueJobRequirementsExtraction(newJobIds);
      } catch (e) {
        logError('[INGEST V2] queueJobRequirementsExtraction failed:', e);
      }
    }

    const toClose = (openJobs ?? []).filter(
      (r: { source_job_id: string }) => !seenIds.has(r.source_job_id)
    );
    const closedIngestJobIds = toClose.map((r: { id: string }) => r.id);
    if (toClose.length > 0) {
      const sourceJobIds = toClose.map((r: { source_job_id: string }) => r.source_job_id);
      await supabase
        .from('ingest_jobs')
        .update({ status: 'closed' })
        .eq('provider', connector.provider)
        .eq('source_org', connector.source_org)
        .in('source_job_id', sourceJobIds);
      result.closed = toClose.length;
      await deactivateClosedJobs(supabase, closedIngestJobIds);
    }

    await supabase
      .from('ingest_connectors')
      .update({
        last_success_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', connectorId);

    result.durationMs = Date.now() - startedAt;
    log(
      `[INGEST V2] ${connector.provider}/${connector.source_org}: fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped} closed=${result.closed} promoted=${result.promoted} in ${result.durationMs}ms`
    );
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.error = errMsg;
    result.durationMs = Date.now() - startedAt;
    await supabase
      .from('ingest_connectors')
      .update({ last_error: errMsg })
      .eq('id', connectorId);
    logError(`[INGEST V2] Connector ${connectorId} failed:`, err);
    throw err;
  }
}

/**
 * Sync all enabled connectors that are due to run based on sync_interval_min.
 */
export async function syncAllConnectors(): Promise<SyncV2Result[]> {
  const supabase = createServiceClient();

  const { data: connectors, error } = await supabase
    .from('ingest_connectors')
    .select('*')
    .eq('is_enabled', true);

  if (error) {
    logError('[INGEST V2] fetch connectors failed:', error.message);
    return [];
  }

  const all = (connectors ?? []) as Connector[];

  if (!all.length) {
    return [];
  }

  const now = Date.now();
  const due = all.filter((row) => {
    const intervalMin = (row.sync_interval_min as number) ?? 60;
    const lastRun = row.last_run_at as string | null | undefined;
    if (!lastRun) return true;
    const elapsed = (now - new Date(lastRun).getTime()) / 60_000;
    return elapsed >= intervalMin;
  });

  if (!due.length) {
    log('[INGEST V2] No connectors due for sync');
    return [];
  }

  return pMap(
    due,
    async (conn) => {
      try {
        return await syncConnectorV2(conn.id);
      } catch {
        // syncConnectorV2 already logs errors; surface a minimal result here
        return {
          connectorId: conn.id,
          provider: conn.provider,
          sourceOrg: conn.source_org,
          fetched: 0,
          upserted: 0,
          closed: 0,
          promoted: 0,
          skipped: 0,
          durationMs: 0,
          error: 'failed',
        } as SyncV2Result;
      }
    },
    { concurrency: CONNECTOR_CONCURRENCY }
  );
}

