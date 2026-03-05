import { SupabaseClient } from '@supabase/supabase-js';
import { structuredLog } from './logger';

/**
 * Statuses that are safe to delete when stale.
 * interview | offer | rejected | withdrawn are intentionally excluded —
 * those represent meaningful recruiter decisions that must be preserved.
 */
const STALE_STATUSES = ['applied', 'screening', 'ready'] as const;

/** Fallback threshold if app_settings.stale_application_days is not set. */
const DEFAULT_STALE_DAYS = 21;

export interface CleanupResult {
    ok: boolean;
    deleted: number;
    kept: number;
    checked: number;
    stale_days: number;
    duration_ms: number;
    run_id: string | null;
    error?: string;
}

/**
 * Run the stale-application cleanup job.
 *
 * Deletes applications with NO status-history activity older than
 * `stale_application_days` days (default 21, configurable via app_settings).
 *
 * Called by:
 *   - GET /api/cron/cleanup  (EventBridge, mode: 'cron')
 *   - POST /api/admin/maintenance/cleanup  (admin UI, mode: 'manual')
 *
 * Writes a row to cron_run_history so every invocation is auditable
 * regardless of trigger source.
 */
export async function runStaleApplicationCleanup(
    supabase: SupabaseClient,
    triggeredBy: 'cron' | 'admin_manual' = 'cron',
): Promise<CleanupResult> {
    const startedAt = new Date();

    // Insert a run record immediately so partial failures are visible
    let runId: string | null = null;
    try {
        const { data: runRow } = await supabase
            .from('cron_run_history')
            .insert({
                started_at: startedAt.toISOString(),
                status: 'running',
                mode: triggeredBy,
            })
            .select('id')
            .single();
        runId = runRow?.id ?? null;
    } catch (_) { }

    try {
        // ── 1. Read stale threshold from settings (falls back to 21 days) ──────────
        const { data: settingRow } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'stale_application_days')
            .maybeSingle();

        const staleDays = Number((settingRow?.value as any)?.value) || DEFAULT_STALE_DAYS;
        const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();

        structuredLog('info', 'cleanup started', { stale_days: staleDays, triggered_by: triggeredBy, run_id: runId });

        // ── 2. Find all candidates older than cutoff with a stale status ─────────
        const { data: staleApps, error: fetchErr } = await supabase
            .from('applications')
            .select('id, status, created_at')
            .in('status', STALE_STATUSES)
            .lt('created_at', cutoff);

        if (fetchErr) {
            await _failRun(supabase, runId, fetchErr.message);
            return { ok: false, deleted: 0, kept: 0, checked: 0, stale_days: staleDays, duration_ms: _elapsed(startedAt), run_id: runId, error: fetchErr.message };
        }

        if (!staleApps || staleApps.length === 0) {
            const elapsed = _elapsed(startedAt);
            await _completeRun(supabase, runId, { deleted: 0, checked: 0, elapsed });
            return { ok: true, deleted: 0, kept: 0, checked: 0, stale_days: staleDays, duration_ms: elapsed, run_id: runId };
        }

        // ── 3. Exclude any that had status-history activity after the cutoff ──────
        const appIds = staleApps.map((a: any) => a.id as string);

        const { data: recentHistory } = await supabase
            .from('application_status_history')
            .select('application_id')
            .in('application_id', appIds)
            .gte('created_at', cutoff);

        const activeIds = new Set((recentHistory ?? []).map((h: any) => h.application_id as string));
        const staleIds = appIds.filter((id: string) => !activeIds.has(id));

        structuredLog('info', 'cleanup eligibility resolved', {
            run_id: runId,
            scanned: staleApps.length,
            eligible_for_delete: staleIds.length,
            kept_due_to_activity: activeIds.size,
        });

        if (staleIds.length === 0) {
            const elapsed = _elapsed(startedAt);
            await _completeRun(supabase, runId, { deleted: 0, checked: staleApps.length, elapsed });
            return { ok: true, deleted: 0, kept: staleApps.length, checked: staleApps.length, stale_days: staleDays, duration_ms: elapsed, run_id: runId };
        }

        // ── 4. Delete the truly stale applications ────────────────────────────────
        const { error: deleteErr } = await supabase
            .from('applications')
            .delete()
            .in('id', staleIds);

        if (deleteErr) {
            await _failRun(supabase, runId, deleteErr.message);
            return { ok: false, deleted: 0, kept: 0, checked: staleApps.length, stale_days: staleDays, duration_ms: _elapsed(startedAt), run_id: runId, error: deleteErr.message };
        }

        const elapsed = _elapsed(startedAt);
        await _completeRun(supabase, runId, { deleted: staleIds.length, checked: staleApps.length, elapsed });

        structuredLog('info', 'cleanup complete', {
            run_id: runId,
            deleted: staleIds.length,
            kept: staleApps.length - staleIds.length,
            duration_ms: elapsed,
            triggered_by: triggeredBy,
        });

        return {
            ok: true,
            deleted: staleIds.length,
            kept: staleApps.length - staleIds.length,
            checked: staleApps.length,
            stale_days: staleDays,
            duration_ms: elapsed,
            run_id: runId,
        };
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        await _failRun(supabase, runId, msg);
        structuredLog('error', 'cleanup unexpected error', { run_id: runId, error: msg });
        return { ok: false, deleted: 0, kept: 0, checked: 0, stale_days: DEFAULT_STALE_DAYS, duration_ms: _elapsed(startedAt), run_id: runId, error: msg };
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _elapsed(from: Date): number {
    return Date.now() - from.getTime();
}

async function _completeRun(
    supabase: SupabaseClient,
    runId: string | null,
    stats: { deleted: number; checked: number; elapsed: number },
) {
    if (!runId) return;
    await supabase.from('cron_run_history').update({
        ended_at: new Date().toISOString(),
        status: 'ok',
        candidates_processed: stats.checked,
        total_matches_upserted: stats.deleted, // reusing column; semantics: "rows acted on"
    }).eq('id', runId);
}

async function _failRun(supabase: SupabaseClient, runId: string | null, message: string) {
    if (!runId) return;
    await supabase.from('cron_run_history').update({
        ended_at: new Date().toISOString(),
        status: 'failed',
        error_message: message.slice(0, 1000),
    }).eq('id', runId);
}
