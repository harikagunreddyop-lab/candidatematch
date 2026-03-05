import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { validateCronAuth } from '@/lib/security';
import { requireAdmin } from '@/lib/api-auth';
import { structuredLog } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DRY-RUN ONLY — THIS ENDPOINT SUBMITS ZERO REAL JOB APPLICATIONS.
 *
 * GET /api/auto-apply/dry-run  (formerly /api/auto-apply/run)
 *
 * INTENDED CALLER: AWS EventBridge Scheduler (if autonomous_apply feature is ON).
 * This endpoint is PASSIVE — it never self-schedules. In production, call it from
 * AWS EventBridge or trigger it manually as an admin.
 *
 * Auth (strict safeguards):
 *   - EITHER: Authorization: Bearer <CRON_SECRET>  (for EventBridge/cron)
 *   - OR:     Admin JWT session (requireAdmin)
 *
 * Behavior:
 *   - Finds candidate_job_matches where:
 *       match_tier = 'autoapply'
 *       p_interview >= 0.35
 *       risk score <= 35
 *   - Writes eligible matches to system_metrics (tracking only).
 *   - Does NOT submit applications to any external ATS.
 *
 * Feature gate: feature_flags.engine.autonomous_apply must be true.
 * Default is false — the endpoint will return { ok: false, dry_run_only: true }
 * if the flag is off.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function GET(req: NextRequest) {
    const hasCronSecret = validateCronAuth(req);
    let adminContext: any = null;

    if (!hasCronSecret) {
        const adminAuth = await requireAdmin(req);
        if (adminAuth instanceof NextResponse) {
            structuredLog('warn', 'auto-apply dry-run unauthorized', {
                caller_ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown',
                user_agent: req.headers.get('user-agent') ?? 'unknown',
            });
            return NextResponse.json({ error: 'Unauthorized', dry_run_only: true }, { status: 401 });
        }
        adminContext = adminAuth;
    }

    structuredLog('info', 'auto-apply dry-run invoked', {
        via: hasCronSecret ? 'cron_secret' : 'admin_manual',
        admin_id: adminContext?.profile?.id ?? adminContext?.user?.id ?? null,
    });

    const supabase = createServiceClient();

    // Feature flag: engine.autonomous_apply
    try {
        const { data: flagRow } = await supabase
            .from('feature_flags')
            .select('value')
            .eq('key', 'engine.autonomous_apply')
            .maybeSingle();
        const enabled = flagRow?.value === true || flagRow?.value === 'true' || flagRow?.value === '"true"';
        if (!enabled) {
            return NextResponse.json(
                {
                    ok: false,
                    dry_run_only: true,
                    reason: 'Autonomous apply engine disabled (feature flag engine.autonomous_apply is off).',
                },
                { status: 200 },
            );
        }
    } catch {
        return NextResponse.json(
            {
                ok: false,
                dry_run_only: true,
                reason: 'Feature flags unavailable; autonomous apply disabled as a safety fallback.',
            },
            { status: 200 },
        );
    }

    const { data: matches, error } = await supabase
        .from('candidate_job_matches')
        .select('id, candidate_id, job_id, match_tier, p_interview, ats_breakdown, ats_breakdown_v3')
        .eq('match_tier', 'autoapply')
        .gte('p_interview', 0.35)
        .limit(200);

    if (error) {
        return NextResponse.json({ ok: false, dry_run_only: true, error: error.message }, { status: 500 });
    }

    const eligible = (matches || []).filter((m: any) => {
        const risk =
            m.ats_breakdown_v3?.dimensions?.risk?.score ??
            m.ats_breakdown?.dimensions?.risk?.score ??
            null;
        return risk == null || risk <= 35;
    });

    // Record eligible matches in system_metrics (no external calls — dry run only)
    const now = new Date().toISOString();
    const rows = eligible.map((m: any) => ({
        metric_name: 'auto_apply_candidates',
        metric_value: 1,
        metadata: {
            candidate_id: m.candidate_id,
            job_id: m.job_id,
            match_id: m.id,
            p_interview: m.p_interview,
            recorded_at: now,
        },
    }));

    if (rows.length) {
        await supabase.from('system_metrics').insert(rows);
    }

    return NextResponse.json({
        ok: true,
        dry_run_only: true,
        inspected_matches: matches?.length || 0,
        eligible_count: eligible.length,
    });
}
