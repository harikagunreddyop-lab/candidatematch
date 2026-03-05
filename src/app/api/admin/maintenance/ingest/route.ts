import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { syncConnector } from '@/ingest/sync';
import { structuredLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CONCURRENCY = 4;

/**
 * POST /api/admin/maintenance/ingest
 *
 * Manual admin-triggered ingest. Same logic as GET /api/cron/ingest.
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

    const { data: connectors, error: fetchErr } = await supabase
        .from('ingest_connectors')
        .select('id, provider, source_org, sync_interval_min, last_run_at')
        .eq('is_enabled', true);

    if (fetchErr) {
        if (runId) await supabase.from('cron_run_history').update({ ended_at: new Date().toISOString(), status: 'failed', error_message: fetchErr.message }).eq('id', runId);
        return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }

    // Sync due connectors (same filter as cron)
    const now = Date.now();
    const due = (connectors ?? []).filter((row: Record<string, unknown>) => {
        const intervalMin = (row.sync_interval_min as number) ?? 60;
        const lastRun = row.last_run_at as string | null | undefined;
        if (!lastRun) return true;
        const elapsed = (now - new Date(lastRun).getTime()) / 60_000;
        return elapsed >= intervalMin;
    });

    if (due.length === 0) {
        if (runId) await supabase.from('cron_run_history').update({ ended_at: new Date().toISOString(), status: 'ok', candidates_processed: 0 }).eq('id', runId);
        return NextResponse.json({ ok: true, synced: 0, skipped: (connectors ?? []).length, run_id: runId, message: 'No connectors due for sync' });
    }

    const results: Array<{ provider: string; source_org: string; fetched: number; promoted: number }> = [];

    for (let i = 0; i < due.length; i += CONCURRENCY) {
        const batch = due.slice(i, i + CONCURRENCY);
        await Promise.all(
            batch.map(async (c: Record<string, unknown>) => {
                try {
                    const result = await syncConnector(c.id as string);
                    results.push({ provider: result.provider, source_org: result.sourceOrg, fetched: result.fetched, promoted: result.promoted });
                } catch (err: unknown) {
                    structuredLog('error', 'manual ingest connector failed', { provider: c.provider, source_org: c.source_org, error: String(err) });
                }
            })
        );
    }

    const elapsed = Date.now() - startedAt;
    const totalPromoted = results.reduce((s, r) => s + r.promoted, 0);

    if (runId) {
        await supabase.from('cron_run_history').update({
            ended_at: new Date().toISOString(),
            status: 'ok',
            mode: 'admin_manual',
            candidates_processed: due.length,
            total_matches_upserted: totalPromoted,
        }).eq('id', runId);
    }

    return NextResponse.json({
        ok: true,
        synced: results.length,
        total_promoted: totalPromoted,
        results,
        elapsed_ms: elapsed,
        run_id: runId,
        message: `Synced ${results.length} connector(s). Promoted ${totalPromoted} job(s).`,
    });
}
