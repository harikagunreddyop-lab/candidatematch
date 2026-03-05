import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { validateCronAuth } from '@/lib/security';
import { runStaleApplicationCleanup } from '@/lib/cleanup';
import { structuredLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/cron/cleanup
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTENDED CALLER: AWS EventBridge Scheduler (daily at 03:00 UTC).
 * See docs/CRON_AMPLIFY.md for full setup instructions.
 *
 * This endpoint does NOT run by itself — it must be called externally.
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * For manual on-demand cleanup (no EventBridge needed), use:
 *   POST /api/admin/maintenance/cleanup  (requires admin JWT)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Deletes applications with NO status-history activity after `stale_application_days`
 * days (default 21, configurable via app_settings).
 *
 * Only deletes: applied | screening | ready
 * Never touches: interview | offer | rejected | withdrawn
 */
export async function GET(req: NextRequest) {
    // Log the caller before auth so we have IP/UA even on 401s
    const callerIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const userAgent = req.headers.get('user-agent') ?? 'unknown';

    structuredLog('info', 'cron cleanup called', {
        caller_ip: callerIp,
        user_agent: userAgent,
        started_at: new Date().toISOString(),
    });

    if (!validateCronAuth(req)) {
        structuredLog('warn', 'cron cleanup unauthorized', { caller_ip: callerIp, user_agent: userAgent });
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const result = await runStaleApplicationCleanup(supabase, 'cron');

    if (!result.ok) {
        structuredLog('error', 'cron cleanup failed', { run_id: result.run_id, error: result.error });
        return NextResponse.json({ ok: false, error: result.error, run_id: result.run_id }, { status: 500 });
    }

    structuredLog('info', 'cron cleanup finished', {
        run_id: result.run_id,
        deleted: result.deleted,
        checked: result.checked,
        duration_ms: result.duration_ms,
    });

    return NextResponse.json({
        ok: true,
        deleted: result.deleted,
        kept: result.kept,
        checked: result.checked,
        stale_days: result.stale_days,
        duration_ms: result.duration_ms,
        run_id: result.run_id,
    });
}
