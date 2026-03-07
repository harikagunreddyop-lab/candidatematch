import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { syncAllConnectors } from '@/ingest/sync-v2';
import { structuredLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/maintenance/ingest
 *
 * Manual admin-triggered ingest. Same logic as GET /api/cron/ingest (sync-v2 engine).
 * Protected by admin JWT (requireAdmin) — NOT CRON_SECRET.
 * Writes to cron_run_history with mode: 'admin_manual'.
 */
export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const startedAt = Date.now();
    const supabase = createServiceClient();

    structuredLog('info', 'manual ingest triggered by admin', {
        admin_id: auth.profile?.id ?? auth.user.id,
    });

    // Write run record
    let runId: string | null = null;
    try {
        const { data: row } = await supabase
            .from('cron_run_history')
            .insert({ started_at: new Date(startedAt).toISOString(), status: 'running', mode: 'admin_manual' })
            .select('id')
            .single();
        runId = row?.id ?? null;
    } catch (_) { }

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
            await supabase.from('cron_run_history').update({
                ended_at: new Date().toISOString(),
                status: 'ok',
                mode: 'admin_manual',
                candidates_processed: results.length,
                total_matches_upserted: totals.promoted,
            }).eq('id', runId);
        }

        return NextResponse.json({
            ok: true,
            synced: results.length,
            total_fetched: totals.fetched,
            total_upserted: totals.upserted,
            total_promoted: totals.promoted,
            total_skipped: totals.skipped,
            results: results.map((r) => ({
                provider: r.provider,
                source_org: r.sourceOrg,
                fetched: r.fetched,
                upserted: r.upserted,
                promoted: r.promoted,
                skipped: r.skipped,
                duration_ms: r.durationMs,
                error: r.error,
            })),
            elapsed_ms: elapsed,
            run_id: runId,
            message: `Synced ${results.length} connector(s). Promoted ${totals.promoted} job(s).`,
        });
    } catch (err: unknown) {
        const elapsed = Date.now() - startedAt;
        const errMsg = err instanceof Error ? err.message : String(err);
        structuredLog('error', 'manual ingest failed', { error: errMsg });

        if (runId) {
            await supabase.from('cron_run_history').update({
                ended_at: new Date().toISOString(),
                status: 'failed',
                error_message: errMsg.slice(0, 1000),
            }).eq('id', runId);
        }

        return NextResponse.json({ ok: false, error: errMsg, elapsed_ms: elapsed, run_id: runId }, { status: 500 });
    }
}
