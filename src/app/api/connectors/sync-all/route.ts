/**
 * POST: Sync all enabled connectors.
 * Admin only. Used by "Sync all" button in Job Boards panel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { syncConnector } from '@/ingest/sync';
import { logAuditServer } from '@/lib/audit';
import { apiLogger } from '@/lib/logger';

const CONCURRENCY = 4;
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceClient();
  const { data: connectors, error: fetchErr } = await supabase
    .from('ingest_connectors')
    .select('id, provider, source_org')
    .eq('is_enabled', true);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!connectors?.length) {
    return NextResponse.json({
      ok: true,
      synced: 0,
      results: [],
      message: 'No enabled connectors to sync',
    });
  }

  const results: Array<{
    id: string;
    provider: string;
    source_org: string;
    fetched: number;
    upserted: number;
    closed: number;
    promoted: number;
    error?: string;
  }> = [];

  for (let i = 0; i < connectors.length; i += CONCURRENCY) {
    const batch = connectors.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (c: { id: string; provider: string; source_org: string }) => {
        try {
          const r = await syncConnector(c.id);
          return {
            id: c.id,
            provider: r.provider,
            source_org: r.sourceOrg,
            fetched: r.fetched,
            upserted: r.upserted,
            closed: r.closed,
            promoted: r.promoted,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            id: c.id,
            provider: c.provider,
            source_org: c.source_org,
            fetched: 0,
            upserted: 0,
            closed: 0,
            promoted: 0,
            error: msg,
          };
        }
      })
    );
    results.push(...batchResults);
  }

  const successCount = results.filter((r) => !r.error).length;
  const totalPromoted = results.reduce((s, r) => s + r.promoted, 0);
  const totalMatchesUpserted = results.reduce((s, r) => s + ((r as any).matching_matches_upserted || 0), 0);
  const totalCandidatesProcessed = results.reduce((s, r) => s + ((r as any).matching_candidates_processed || 0), 0);

  try {
    await logAuditServer(supabase as never, {
      actor_id: auth.user.id,
      actor_role: auth.profile.effective_role,
    }, {
      action: 'connector.sync',
      resourceType: 'ingest_connectors',
      details: {
        mode: 'sync_all',
        total_connectors: results.length,
        synced: successCount,
        failed: results.length - successCount,
        total_promoted: totalPromoted,
        total_matches_upserted: totalMatchesUpserted,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    apiLogger.warn({ route: '/api/connectors/sync-all', user_id: auth.user.id, err: message }, 'connector sync-all audit log failed');
  }

  apiLogger.info({
    route: '/api/connectors/sync-all',
    user_id: auth.user.id,
    synced: successCount,
    failed: results.length - successCount,
    total_promoted: totalPromoted,
    total_matches_upserted: totalMatchesUpserted,
    duration_ms: Date.now() - startedAt,
  }, 'connector sync-all completed');

  return NextResponse.json({
    ok: true,
    synced: successCount,
    failed: results.length - successCount,
    totalPromoted,
    totalMatchesUpserted,
    totalCandidatesProcessed,
    results,
  });
}
