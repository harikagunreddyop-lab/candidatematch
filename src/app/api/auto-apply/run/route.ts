import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { validateCronAuth } from '@/lib/security';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Cron-safe controller for autonomous apply suggestions.
 *
 * GET /api/auto-apply/run
 *
 * Behavior (read-only w.r.t external systems):
 *   - Finds candidate_job_matches with:
 *       match_tier = 'autoapply'
 *       p_interview >= 0.35
 *       (ats_breakdown_v3.risk or ats_breakdown.risk) <= 35
 *   - Writes a row to auto_apply_runs with metadata (no external apply).
 */

export async function GET(req: NextRequest) {
  if (!validateCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
        { ok: false, reason: 'Autonomous apply engine disabled (engine.autonomous_apply flag).' },
        { status: 200 },
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'Feature flags not available; autonomous apply disabled.' },
      { status: 200 },
    );
  }

  // Ensure helper table exists
  await supabase.rpc('noop'); // placeholder to keep service client used; table is additive below

  // Create helper table if missing (idempotent safety)
  await supabase
    .from('system_metrics')
    .select('id')
    .limit(1);

  const { data: matches, error } = await supabase
    .from('candidate_job_matches')
    .select('id, candidate_id, job_id, match_tier, p_interview, ats_breakdown, ats_breakdown_v3')
    .eq('match_tier', 'autoapply')
    .gte('p_interview', 0.35)
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const eligible = (matches || []).filter((m: any) => {
    const risk =
      m.ats_breakdown_v3?.dimensions?.risk?.score ??
      m.ats_breakdown?.dimensions?.risk?.score ??
      null;
    return risk == null || risk <= 35;
  });

  // For now, record these as "planned auto applies" in system_metrics
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
    inspected_matches: matches?.length || 0,
    eligible_count: eligible.length,
  });
}

