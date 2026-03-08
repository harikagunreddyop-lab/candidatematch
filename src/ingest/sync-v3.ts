/**
 * Job ingestion sync v3: quality validation, spam detection, invalid filtering.
 *
 * Builds on sync-v2 with:
 * - Quality scoring (0-100) and flags
 * - Spam detection (pattern + quality threshold)
 * - Invalid job filtering (missing fields, malformed, suspicious content)
 * - Quality threshold (reject < 40)
 * - Per-job error recovery (one bad job does not stop the run)
 * - Quality score only computed for new/changed jobs (content_hash skip)
 *
 * Target: 10k+ jobs/day with <5% false positives.
 */

import pMap from 'p-map';
import chunk from 'lodash/chunk';

import { createServiceClient } from '@/lib/supabase-server';
import { log, error as logError } from '@/lib/logger';
import { adapters, type Connector, type CanonicalJob, type ListItem } from './adapters';
import { scoreJobQuality, type JobForQuality } from './quality-scorer';
import { isSpam } from './spam-detector';
import { isInvalidJob } from './invalid-detector';
import { promoteIngestJobsBulk } from './promote-v2';
import { deactivateClosedJobs } from './promote';
import { queueJobRequirementsExtraction } from './queue';

export interface SyncV3Result {
  connectorId: string;
  provider: string;
  sourceOrg: string;
  fetched: number;
  rejectedInvalid: number;
  rejectedSpam: number;
  rejectedLowQuality: number;
  upserted: number;
  closed: number;
  promoted: number;
  skipped: number;
  durationMs: number;
  error?: string;
}

const ITEM_CONCURRENCY = parseInt(process.env.INGEST_ITEM_CONCURRENCY ?? '50', 10) || 50;
const CONNECTOR_CONCURRENCY = parseInt(process.env.INGEST_CONNECTOR_CONCURRENCY ?? '10', 10) || 10;
const UPSERT_BATCH_SIZE = parseInt(process.env.INGEST_UPSERT_BATCH_SIZE ?? '1000', 10) || 1000;
const QUALITY_THRESHOLD = parseInt(process.env.INGEST_QUALITY_THRESHOLD ?? '40', 10) || 40;

/** CanonicalJob with quality fields set after validation pipeline */
export type ProcessedJob = CanonicalJob & { quality_score: number; quality_flags: string[] };

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
          `[INGEST V3] detail/normalize failed for ${connector.provider}/${connector.source_org} item=${item.id}:`,
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

/**
 * Run validation pipeline: invalid -> quality score -> spam -> quality threshold.
 * CanonicalJob is JobForQuality (description_text = jd_raw, source_org = company).
 * Per-job try/catch for error recovery.
 */
async function processJobs(jobs: CanonicalJob[]): Promise<{
  processed: ProcessedJob[];
  rejectedInvalid: number;
  rejectedSpam: number;
  rejectedLowQuality: number;
}> {
  const processed: ProcessedJob[] = [];
  let rejectedInvalid = 0;
  let rejectedSpam = 0;
  let rejectedLowQuality = 0;

  for (const job of jobs) {
    try {
      const asQualityJob: JobForQuality = job;

      const validity = isInvalidJob(asQualityJob);
      if (!validity.valid) {
        log(`[INGEST V3] Rejected invalid job: ${job.title ?? job.source_job_id} - ${validity.reason}`);
        rejectedInvalid++;
        continue;
      }

      const qualityScore = await scoreJobQuality(asQualityJob);
      const withScore = {
        ...job,
        quality_score: Math.round(qualityScore.overall),
        quality_flags: qualityScore.flags,
      };

      if (isSpam(asQualityJob, qualityScore)) {
        log(`[INGEST V3] Rejected spam job: ${job.title ?? job.source_job_id}`);
        rejectedSpam++;
        continue;
      }

      if (qualityScore.overall < QUALITY_THRESHOLD) {
        log(
          `[INGEST V3] Rejected low-quality job: ${job.title ?? job.source_job_id} (score: ${qualityScore.overall})`
        );
        rejectedLowQuality++;
        continue;
      }

      processed.push(withScore);
    } catch (err) {
      logError(
        `[INGEST V3] Validation failed for job ${job.source_job_id} (${job.title ?? 'no title'}):`,
        err
      );
      rejectedInvalid++;
    }
  }

  return { processed, rejectedInvalid, rejectedSpam, rejectedLowQuality };
}

async function upsertIngestJobsBatch(
  connector: Connector,
  jobs: ProcessedJob[]
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
    logError('[INGEST V3] fetch existing ingest_jobs failed:', existingErr.message);
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
      quality_score: job.quality_score,
      quality_flags: job.quality_flags.length ? job.quality_flags : null,
      is_spam: false,
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
        `[INGEST V3] upsert ingest_jobs batch failed for ${connector.provider}/${connector.source_org}:`,
        upsertErr.message
      );
      continue;
    }

    upserted += batch.length;
  }

  return { upserted, skipped };
}

export async function syncConnectorV3(connectorId: string): Promise<SyncV3Result> {
  const supabase = createServiceClient();
  const startedAt = Date.now();

  const { data: conn, error: connError } = await supabase
    .from('ingest_connectors')
    .select('*')
    .eq('id', connectorId)
    .single();

  if (connError || !conn) {
    const err = connError?.message ?? 'Connector not found';
    logError(`[INGEST V3] Connector ${connectorId}: ${err}`);
    throw new Error(err);
  }

  const connector = conn as Connector;

  const result: SyncV3Result = {
    connectorId,
    provider: connector.provider,
    sourceOrg: connector.source_org,
    fetched: 0,
    rejectedInvalid: 0,
    rejectedSpam: 0,
    rejectedLowQuality: 0,
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

    const { processed, rejectedInvalid, rejectedSpam, rejectedLowQuality } = await processJobs(jobs);
    result.rejectedInvalid = rejectedInvalid;
    result.rejectedSpam = rejectedSpam;
    result.rejectedLowQuality = rejectedLowQuality;

    const seenIds = new Set<string>(jobs.map((j) => j.source_job_id));

    const { upserted, skipped } = await upsertIngestJobsBatch(connector, processed);
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
        logError('[INGEST V3] queueJobRequirementsExtraction failed:', e);
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
      `[INGEST V3] ${connector.provider}/${connector.source_org}: fetched=${result.fetched} rejectedInvalid=${result.rejectedInvalid} rejectedSpam=${result.rejectedSpam} rejectedLowQuality=${result.rejectedLowQuality} upserted=${result.upserted} skipped=${result.skipped} closed=${result.closed} promoted=${result.promoted} in ${result.durationMs}ms`
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
    logError(`[INGEST V3] Connector ${connectorId} failed:`, err);
    throw err;
  }
}

/**
 * Sync all enabled connectors that are due (sync_interval_min) using V3 pipeline.
 */
export async function syncAllConnectorsV3(): Promise<SyncV3Result[]> {
  const supabase = createServiceClient();

  const { data: connectors, error } = await supabase
    .from('ingest_connectors')
    .select('*')
    .eq('is_enabled', true);

  if (error) {
    logError('[INGEST V3] fetch connectors failed:', error.message);
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
    log('[INGEST V3] No connectors due for sync');
    return [];
  }

  return pMap(
    due,
    async (conn) => {
      try {
        return await syncConnectorV3(conn.id);
      } catch {
        return {
          connectorId: conn.id,
          provider: conn.provider,
          sourceOrg: conn.source_org,
          fetched: 0,
          rejectedInvalid: 0,
          rejectedSpam: 0,
          rejectedLowQuality: 0,
          upserted: 0,
          closed: 0,
          promoted: 0,
          skipped: 0,
          durationMs: 0,
          error: 'failed',
        } as SyncV3Result;
      }
    },
    { concurrency: CONNECTOR_CONCURRENCY }
  );
}
