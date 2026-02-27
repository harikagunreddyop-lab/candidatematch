import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { log, error as logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

/** Default number of stale days if no setting is stored. */
const DEFAULT_STALE_DAYS = 21;

/**
 * Statuses that are safe to auto-delete when stale.
 * interview / offer / rejected / withdrawn are intentionally excluded —
 * those represent meaningful recruiter decisions that must be preserved.
 */
const STALE_STATUSES = ['applied', 'screening', 'ready'];

function verifyCronAuth(req: NextRequest): boolean {
    if (!CRON_SECRET) {
        logError('[CLEANUP] CRON_SECRET env var is not set — rejecting');
        return false;
    }
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
        logError('[CLEANUP] Invalid authorization header');
        return false;
    }
    return true;
}

/**
 * GET /api/cron/cleanup
 *
 * Runs automatically every day at 03:00 UTC (configured in vercel.json).
 * Deletes applications that have had NO status-history activity for
 * `stale_application_days` days (default: 21).
 *
 * Only affects: applied | screening | ready
 * Never touches: interview | offer | rejected | withdrawn
 *
 * Threshold is configurable via app_settings key `stale_application_days`.
 */
export async function GET(req: NextRequest) {
    if (!verifyCronAuth(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // ── Read threshold from settings (falls back to 21 days) ──────────────────
    const { data: settingRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'stale_application_days')
        .maybeSingle();

    const staleDays = Number((settingRow?.value as any)?.value) || DEFAULT_STALE_DAYS;

    log(`[CLEANUP] Running automatic stale-application cleanup (threshold: ${staleDays} days)`);

    const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();

    // ── Step 1: find all eligible applications older than the cutoff ───────────
    const { data: staleCandidate, error: fetchErr } = await supabase
        .from('applications')
        .select('id, status, created_at')
        .in('status', STALE_STATUSES)
        .lt('created_at', cutoff);

    if (fetchErr) {
        logError('[CLEANUP] Failed to fetch applications:', fetchErr.message);
        return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }

    if (!staleCandidate || staleCandidate.length === 0) {
        log('[CLEANUP] No stale applications found — nothing to delete');
        return NextResponse.json({ ok: true, deleted: 0, checked: 0, stale_days: staleDays });
    }

    log(`[CLEANUP] ${staleCandidate.length} old applications found — checking for recent activity...`);

    // ── Step 2: exclude any that had a status-history update after the cutoff ──
    const appIds = staleCandidate.map((a: any) => a.id as string);

    const { data: recentHistory } = await supabase
        .from('application_status_history')
        .select('application_id')
        .in('application_id', appIds)
        .gte('created_at', cutoff);

    const activeIds = new Set((recentHistory ?? []).map((h: any) => h.application_id as string));

    const staleIds = (appIds as string[]).filter((id: string) => !activeIds.has(id));

    if (staleIds.length === 0) {
        log('[CLEANUP] All old applications have recent activity — nothing deleted');
        return NextResponse.json({ ok: true, deleted: 0, checked: staleCandidate.length, stale_days: staleDays });
    }

    // ── Step 3: delete the truly stale applications ────────────────────────────
    log(`[CLEANUP] Deleting ${staleIds.length} stale application(s) (${staleCandidate.length - staleIds.length} had recent activity and were kept)`);

    const { error: deleteErr } = await supabase
        .from('applications')
        .delete()
        .in('id', staleIds);

    if (deleteErr) {
        logError('[CLEANUP] Delete failed:', deleteErr.message);
        return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 });
    }

    log(`[CLEANUP] Done — deleted ${staleIds.length} stale application(s) successfully`);

    return NextResponse.json({
        ok: true,
        deleted: staleIds.length,
        kept: staleCandidate.length - staleIds.length,
        checked: staleCandidate.length,
        stale_days: staleDays,
    });
}
