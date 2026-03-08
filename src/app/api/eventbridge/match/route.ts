/**
 * POST /api/eventbridge/match
 *
 * EventBridge (or scheduler) invokes this to run auto-matching.
 * Auth: Authorization: Bearer <CRON_SECRET> (same as cron endpoints).
 * Body: { "mode": "match", "minScore": 70, "notifyThreshold": 85 }
 *       or EventBridge format: { "detail": { "mode", "minScore", "notifyThreshold" } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/security';
import { AutoMatcher } from '@/lib/matching/auto-matcher';
import { createServiceClient } from '@/lib/supabase-server';
import { structuredLog } from '@/lib/logger';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!validateCronAuth(req)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: { mode?: string; minScore?: number; notifyThreshold?: number; detail?: { mode?: string; minScore?: number; notifyThreshold?: number } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const detail = body.detail || body;
  const mode = detail.mode || body.mode;
  if (mode !== 'match') {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }

  const minScore = detail.minScore ?? body.minScore ?? 70;
  const notifyThreshold = detail.notifyThreshold ?? body.notifyThreshold ?? 85;

  const supabase = createServiceClient();
  let runId: string | null = null;
  try {
    const { data: row } = await supabase
      .from('cron_run_history')
      .insert({ started_at: new Date().toISOString(), status: 'running', mode: 'eventbridge_match' })
      .select('id')
      .single();
    runId = row?.id ?? null;
  } catch {
    // best-effort
  }

  try {
    structuredLog('info', 'eventbridge match started', { minScore, notifyThreshold, run_id: runId });
    const matcher = new AutoMatcher();
    const results = await matcher.matchNewJobs({
      minScore,
      notifyThreshold,
      hoursBack: 2,
    });

    if (runId) {
      await supabase
        .from('cron_run_history')
        .update({
          ended_at: new Date().toISOString(),
          status: 'ok',
          mode: 'eventbridge_match',
          candidates_processed: results.candidatesChecked,
          total_matches_upserted: results.totalMatches,
        })
        .eq('id', runId);
    }

    structuredLog('info', 'eventbridge match completed', {
      run_id: runId,
      totalMatches: results.totalMatches,
      highScoreMatches: results.highScoreMatches,
    });

    return NextResponse.json({
      success: true,
      run_id: runId,
      totalMatches: results.totalMatches,
      highScoreMatches: results.highScoreMatches,
      jobsProcessed: results.jobsProcessed,
      candidatesChecked: results.candidatesChecked,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    structuredLog('error', 'eventbridge match failed', { run_id: runId, error: message });
    if (runId) {
      await supabase
        .from('cron_run_history')
        .update({
          ended_at: new Date().toISOString(),
          status: 'failed',
          mode: 'eventbridge_match',
          error_message: message.slice(0, 1000),
        })
        .eq('id', runId);
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
