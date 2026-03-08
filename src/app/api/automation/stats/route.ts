import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export type AutomationStats = {
  ingest: {
    lastRun: string | null;
    jobsAdded: number;
    successRate: number;
    nextRun: string;
  };
  matching: {
    lastRun: string | null;
    matchesCreated: number;
    highScoreMatches: number;
    nextRun: string;
  };
  pipeline: {
    ingest: { status: string; time: string };
    qualityCheck: { status: string; time: string };
    matching: { status: string; time: string };
    notify: { status: string; time: string };
  };
};

function formatRelative(d: Date): string {
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** GET — admin: automation pipeline stats for monitoring dashboard */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    lastIngest,
    lastMatch,
    ingestRuns,
    highScoreCount,
  ] = await Promise.all([
    supabase
      .from('cron_run_history')
      .select('ended_at, started_at, total_matches_upserted')
      .eq('mode', 'cron_ingest')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('cron_run_history')
      .select('ended_at, started_at, total_matches_upserted')
      .in('mode', ['incremental', 'eventbridge_match'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('cron_run_history')
      .select('status')
      .eq('mode', 'cron_ingest')
      .gte('started_at', sevenDaysAgo),
    supabase
      .from('ats_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'auto_match_high_score')
      .gte('created_at', oneDayAgo),
  ]);

  const ingestRun = lastIngest.data;
  const matchRun = lastMatch.data;
  const ingestList = ingestRuns.data ?? [];
  const okCount = ingestList.filter((r: { status: string }) => r.status === 'ok').length;
  const successRate = ingestList.length > 0 ? Math.round((okCount / ingestList.length) * 100) : 0;
  const highScoreMatches = highScoreCount.count ?? 0;

  const pipelineStatus = (run: { ended_at?: string | null; started_at?: string } | null) => {
    if (!run) return { status: 'pending', time: '—' };
    const t = run.ended_at || run.started_at;
    const date = t ? new Date(t) : null;
    const timeStr = date ? formatRelative(date) : '—';
    return { status: run.ended_at ? 'success' : 'running', time: timeStr };
  };

  const stats: AutomationStats = {
    ingest: {
      lastRun: ingestRun?.ended_at ?? ingestRun?.started_at ?? null,
      jobsAdded: ingestRun?.total_matches_upserted ?? 0,
      successRate,
      nextRun: 'Every 1h',
    },
    matching: {
      lastRun: matchRun?.ended_at ?? matchRun?.started_at ?? null,
      matchesCreated: matchRun?.total_matches_upserted ?? 0,
      highScoreMatches,
      nextRun: 'Every 2h',
    },
    pipeline: {
      ingest: pipelineStatus(ingestRun ? { ended_at: ingestRun.ended_at, started_at: ingestRun.started_at } : null),
      qualityCheck: pipelineStatus(ingestRun ? { ended_at: ingestRun.ended_at, started_at: ingestRun.started_at } : null),
      matching: pipelineStatus(matchRun ? { ended_at: matchRun.ended_at, started_at: matchRun.started_at } : null),
      notify: pipelineStatus(matchRun ? { ended_at: matchRun.ended_at, started_at: matchRun.started_at } : null),
    },
  };

  return NextResponse.json(stats);
}
