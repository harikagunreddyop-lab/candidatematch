/**
 * Type-B job ingestion sync engine.
 * list -> detail -> normalize -> upsert -> mark missing closed
 */

import { createServiceClient } from '@/lib/supabase-server';
import { log, error as logError } from '@/lib/logger';
import { precomputeJobRequirements, runMatchingForJobs } from '@/lib/matching';
import { adapters, type Connector } from './adapters';
import { promoteIngestJobs, deactivateClosedJobs } from './promote';

export interface SyncResult {
  connectorId: string;
  provider: string;
  sourceOrg: string;
  fetched: number;
  upserted: number;
  closed: number;
  promoted: number;
  matching_candidates_processed: number;
  matching_matches_upserted: number;
  matching_status: 'skipped' | 'done' | 'error' | 'timed_out';
  matching_error?: string;
  durationMs: number;
  error?: string;
}

const MATCHING_BUDGET_MS = Number(process.env.INGEST_MATCHING_BUDGET_MS || 20000);

export async function syncConnector(connectorId: string): Promise<SyncResult> {
  const supabase = createServiceClient();
  const startedAt = Date.now();

  const { data: conn, error: connError } = await supabase
    .from('ingest_connectors')
    .select('*')
    .eq('id', connectorId)
    .single();

  if (connError || !conn) {
    const err = connError?.message ?? 'Connector not found';
    logError(`[INGEST] Connector ${connectorId}: ${err}`);
    throw new Error(err);
  }

  const connector = conn as Connector;
  const adapter = adapters[connector.provider as keyof typeof adapters];
  if (!adapter) {
    throw new Error(`Unknown provider: ${connector.provider}`);
  }

  const result: SyncResult = {
    connectorId,
    provider: connector.provider,
    sourceOrg: connector.source_org,
    fetched: 0,
    upserted: 0,
    closed: 0,
    promoted: 0,
    matching_candidates_processed: 0,
    matching_matches_upserted: 0,
    matching_status: 'skipped',
    durationMs: 0,
  };

  await supabase
    .from('ingest_connectors')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', connectorId);

  try {
    const items = await adapter.list(connector);
    result.fetched = items.length;

    const seenIds = new Set<string>();
    for (const item of items) {
      try {
        const raw = await adapter.detail(connector, item);
        const job = adapter.normalize(connector, raw);
        seenIds.add(job.source_job_id);

        const { error: upsertErr } = await supabase
          .from('ingest_jobs')
          .upsert(
            {
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
            },
            {
              onConflict: 'provider,source_org,source_job_id',
              ignoreDuplicates: false,
            }
          )
          .select('id');

        if (!upsertErr) result.upserted++;
      } catch (itemErr: unknown) {
        logError(`[INGEST] Item ${item.id} failed:`, itemErr);
      }
    }

    const { data: openJobs } = await supabase
      .from('ingest_jobs')
      .select('id, source_job_id')
      .eq('provider', connector.provider)
      .eq('source_org', connector.source_org)
      .eq('status', 'open');

    const openIngestJobIds = (openJobs ?? []).map((r: { id: string }) => r.id);
    const { promoted: promotedCount, newJobIds } = await promoteIngestJobs(supabase, openIngestJobIds);
    result.promoted = promotedCount;
    if (newJobIds.length > 0) {
      try {
        await precomputeJobRequirements(supabase, newJobIds);
      } catch (e) {
        logError('[INGEST] precomputeJobRequirements failed:', e);
      }
      try {
        // Keep sync endpoint responsive in serverless environments by capping
        // inline matching time. If matching exceeds budget, sync still succeeds.
        const matchPromise = runMatchingForJobs(newJobIds);
        const timeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), MATCHING_BUDGET_MS);
        });
        const match = await Promise.race([matchPromise, timeoutPromise]);
        if (match) {
          result.matching_candidates_processed = match.candidates_processed;
          result.matching_matches_upserted = match.total_matches_upserted;
          result.matching_status = 'done';
        } else {
          result.matching_status = 'timed_out';
          result.matching_error = `Matching exceeded ${MATCHING_BUDGET_MS}ms budget`;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        result.matching_status = 'error';
        result.matching_error = msg;
        logError('[INGEST] runMatchingForJobs failed:', e);
      }
    }

    const toClose = (openJobs ?? []).filter((r: { source_job_id: string }) => !seenIds.has(r.source_job_id));
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
      `[INGEST] ${connector.provider}/${connector.source_org}: fetched=${result.fetched} upserted=${result.upserted} closed=${result.closed} promoted=${result.promoted} in ${result.durationMs}ms`
    );
    return result;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.error = errMsg;
    result.durationMs = Date.now() - startedAt;
    await supabase
      .from('ingest_connectors')
      .update({ last_error: errMsg })
      .eq('id', connectorId);
    logError(`[INGEST] Connector ${connectorId} failed:`, err);
    throw err;
  }
}
