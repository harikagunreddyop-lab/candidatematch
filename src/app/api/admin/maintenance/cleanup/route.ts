import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { runStaleApplicationCleanup } from '@/lib/cleanup';
import { structuredLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/admin/maintenance/cleanup
 *
 * Manual admin-triggered cleanup fallback.
 * Protected by admin JWT (requireAdmin) — NOT CRON_SECRET.
 *
 * Use this when AWS EventBridge is not configured, or to run cleanup on demand.
 * Returns a full summary so the admin can verify what was cleaned.
 *
 * Writes a `cron_run_history` row with mode: 'admin_manual' for auditability.
 */
export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const supabase = createServiceClient();

    structuredLog('info', 'manual cleanup triggered by admin', {
        admin_id: auth.profile?.id ?? auth.user.id,
        user_agent: req.headers.get('user-agent') ?? 'unknown',
    });

    const result = await runStaleApplicationCleanup(supabase, 'admin_manual');

    if (!result.ok) {
        return NextResponse.json(
            { ok: false, error: result.error, run_id: result.run_id },
            { status: 500 },
        );
    }

    return NextResponse.json({
        ok: true,
        deleted: result.deleted,
        kept: result.kept,
        checked: result.checked,
        stale_days: result.stale_days,
        duration_ms: result.duration_ms,
        run_id: result.run_id,
        message: `Deleted ${result.deleted} stale application(s). Scanned ${result.checked}, kept ${result.kept} with recent activity.`,
    });
}
