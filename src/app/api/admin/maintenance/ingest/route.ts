import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { syncAllConnectors } from '@/ingest/sync-v2';
import { syncAllConnectorsV3, type SyncV3Result } from '@/ingest/sync-v3';
import { structuredLog } from '@/lib/logger';

const USE_V3 = process.env.INGEST_USE_V3 === 'true';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/maintenance/ingest
 *
 * Manual admin-triggered ingest. Same logic as GET /api/cron/ingest.
 * Uses sync-v3 when INGEST_USE_V3=true, else sync-v2. Protected by admin JWT.
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
        const results = USE_V3 ? await syncAllConnectorsV3() : await syncAllConnectors();

        const elapsed = Date.now() - startedAt;
        const totals = results.reduce(
            (acc, r) => {
                const v3 = r as SyncV3Result;
                const rev = typeof v3.rejectedInvalid === 'number' ? v3.rejectedInvalid : 0;
                const rsp = typeof v3.rejectedSpam === 'number' ? v3.rejectedSpam : 0;
                const rlq = typeof v3.rejectedLowQuality === 'number' ? v3.rejectedLowQuality : 0;
                return {
                    fetched: acc.fetched + r.fetched,
                    upserted: acc.upserted + r.upserted,
                    promoted: acc.promoted + r.promoted,
                    skipped: acc.skipped + r.skipped,
                    rejectedInvalid: acc.rejectedInvalid + rev,
                    rejectedSpam: acc.rejectedSpam + rsp,
                    rejectedLowQuality: acc.rejectedLowQuality + rlq,
                };
            },
            { fetched: 0, upserted: 0, promoted: 0, skipped: 0, rejectedInvalid: 0, rejectedSpam: 0, rejectedLowQuality: 0 }
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
            engine: USE_V3 ? 'v3' : 'v2',
            synced: results.length,
            total_fetched: totals.fetched,
            total_upserted: totals.upserted,
            total_promoted: totals.promoted,
            total_skipped: totals.skipped,
            ...(USE_V3 && {
                total_rejected_invalid: totals.rejectedInvalid,
                total_rejected_spam: totals.rejectedSpam,
                total_rejected_low_quality: totals.rejectedLowQuality,
            }),
            results: results.map((r) => {
                const v3 = r as SyncV3Result;
                return {
                    provider: r.provider,
                    source_org: r.sourceOrg,
                    fetched: r.fetched,
                    upserted: r.upserted,
                    promoted: r.promoted,
                    skipped: r.skipped,
                    ...(typeof v3.rejectedInvalid === 'number' && {
                        rejectedInvalid: v3.rejectedInvalid,
                        rejectedSpam: v3.rejectedSpam,
                        rejectedLowQuality: v3.rejectedLowQuality,
                    }),
                    duration_ms: r.durationMs,
                    error: r.error,
                };
            }),
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
