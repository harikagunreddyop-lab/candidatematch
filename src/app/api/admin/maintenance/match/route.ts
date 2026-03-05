import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { runMatching } from '@/lib/matching';
import { structuredLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/maintenance/match
 *
 * Manual admin-triggered matching. Same logic as GET /api/cron/match.
 * Protected by admin JWT (requireAdmin) — NOT CRON_SECRET.
 * Writes to cron_run_history with mode: 'admin_manual'.
 *
 * Accepts optional body: { candidate_id?: string }
 * If candidate_id is provided, matches only that candidate.
 */
export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    let candidateId: string | undefined;
    try {
        const body = await req.json();
        candidateId = body.candidate_id ?? undefined;
    } catch { /* no body is fine — run for all candidates */ }

    const startedAt = new Date();
    const supabase = createServiceClient();

    structuredLog('info', 'manual matching triggered by admin', {
        admin_id: auth.profile?.id ?? auth.user.id,
        candidate_id: candidateId ?? 'all',
    });

    // Write run record
    let runId: string | null = null;
    try {
        const { data: row } = await supabase
            .from('cron_run_history')
            .insert({ started_at: startedAt.toISOString(), status: 'running', mode: 'admin_manual' })
            .select('id')
            .single();
        runId = row?.id ?? null;
    } catch (_) { }

    try {
        const result = await runMatching(
            candidateId,
            (msg) => structuredLog('info', msg, { run_id: runId }),
        );

        const endedAt = new Date();
        const elapsed = endedAt.getTime() - startedAt.getTime();

        if (runId) {
            await supabase.from('cron_run_history').update({
                ended_at: endedAt.toISOString(),
                status: 'ok',
                mode: 'admin_manual',
                candidates_processed: result.candidates_processed ?? 0,
                total_matches_upserted: result.total_matches_upserted ?? 0,
            }).eq('id', runId);
        }

        return NextResponse.json({
            ok: true,
            candidates_processed: result.candidates_processed ?? 0,
            total_matches_upserted: result.total_matches_upserted ?? 0,
            elapsed_ms: elapsed,
            run_id: runId,
            message: `Matched ${result.candidates_processed ?? 0} candidate(s), ${result.total_matches_upserted ?? 0} match row(s).`,
        });
    } catch (err: any) {
        const elapsed = Date.now() - startedAt.getTime();
        structuredLog('error', 'manual matching failed', { run_id: runId, error: err?.message });

        if (runId) {
            await supabase.from('cron_run_history').update({
                ended_at: new Date().toISOString(),
                status: 'failed',
                error_message: err.message?.slice(0, 1000) ?? String(err),
            }).eq('id', runId);
        }

        return NextResponse.json({ ok: false, error: err.message, elapsed_ms: elapsed, run_id: runId }, { status: 500 });
    }
}
