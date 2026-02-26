/**
 * Admin route: rebuild calibration curves.
 *
 * POST /api/admin/calibration/rebuild
 *
 * Body (optional):
 *   { "profiles": ["A", "C"], "jobFamilies": ["software-engineering", "data-engineering"] }
 *
 * Protected: admin role only.
 * Gate: feature flag 'elite.calibration' must be enabled.
 *
 * Idempotent: safe to run multiple times; upsets into calibration_curves table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { rebuildCalibrationCurves } from '@/lib/calibration/isotonic';
import { requireAdmin } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 60; // Calibration may process 10k+ rows

export async function POST(req: NextRequest) {
    // Auth: admin only
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const supabase = createServiceClient();

    // Feature flag gate
    const { data: flagRow } = await supabase
        .from('feature_flags')
        .select('value')
        .eq('key', 'elite.calibration')
        .maybeSingle();
    const flagEnabled = flagRow?.value === true || flagRow?.value === 'true' || flagRow?.value === '"true"';
    if (!flagEnabled) {
        return NextResponse.json(
            { error: 'Feature flag elite.calibration is not enabled. Set it in the admin feature flags UI first.' },
            { status: 403 }
        );
    }

    // Parse body (optional — defaults to both profiles, no specific families)
    let profiles: ('A' | 'C')[] = ['A', 'C'];
    let jobFamilies: string[] = [];
    try {
        const body = await req.json().catch(() => ({}));
        if (Array.isArray(body?.profiles)) profiles = body.profiles;
        if (Array.isArray(body?.jobFamilies)) jobFamilies = body.jobFamilies;
    } catch { /* ignore parse errors */ }

    const startMs = Date.now();
    const { rebuilt, errors } = await rebuildCalibrationCurves(supabase, profiles, jobFamilies);
    const durationMs = Date.now() - startMs;

    return NextResponse.json({
        ok: errors.length === 0,
        rebuilt,
        errors,
        duration_ms: durationMs,
        message: errors.length === 0
            ? `Rebuilt ${rebuilt} calibration curve(s) in ${durationMs}ms`
            : `Rebuilt ${rebuilt} curve(s) with ${errors.length} error(s)`,
    });
}
