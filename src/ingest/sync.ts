/**
 * Type-B job ingestion sync engine.
 * list -> detail -> normalize -> upsert -> mark missing closed
 */

import { createServiceClient } from '@/lib/supabase-server';
import { log, error as logError } from '@/lib/logger';
import { adapters, type Connector } from './adapters';

export interface SyncResult {
  connectorId: string;
  provider: string;
  sourceOrg: string;
  fetched: number;
  upserted: number;
  closed: number;
  durationMs: number;
  error?: string;
}

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
      .select('source_job_id')
      .eq('provider', connector.provider)
      .eq('source_org', connector.source_org)
      .eq('status', 'open');

    const toClose = (openJobs ?? []).filter((r: { source_job_id: string }) => !seenIds.has(r.source_job_id));
    if (toClose.length > 0) {
      const ids = toClose.map((r: { source_job_id: string }) => r.source_job_id);
      await supabase
        .from('ingest_jobs')
        .update({ status: 'closed' })
        .eq('provider', connector.provider)
        .eq('source_org', connector.source_org)
        .in('source_job_id', ids);
      result.closed = toClose.length;
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
      `[INGEST] ${connector.provider}/${connector.source_org}: fetched=${result.fetched} upserted=${result.upserted} closed=${result.closed} in ${result.durationMs}ms`
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
