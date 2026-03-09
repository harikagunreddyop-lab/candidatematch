import { NextRequest, NextResponse } from 'next/server';
import { runMatching } from '@/lib/matching';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { startApplicationRun } from '@/queue/flows/applicationRun.flow';
import { apiLogger } from '@/lib/logger';
import { logAuditServer } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;
  const startedAt = Date.now();

  const body = await req.json().catch(() => ({}));

  // Async mode — enqueue and return immediately (< 500ms)
  if (body.async) {
    try {
      const result = await startApplicationRun(body.candidate_id, body.intent || {});
      apiLogger.info(
        {
          route: '/api/matches',
          mode: 'async',
          user_id: authResult.user.id,
          run_id: result.runId,
          duration_ms: Date.now() - startedAt,
        },
        'matches async run queued',
      );
      return NextResponse.json({ run_id: result.runId, status: 'queued' }, { status: 202 });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // Legacy sync mode — SSE stream (admin panel backward compat)
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (d: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
      try {
        const result = await runMatching(body.candidate_id, (msg) => send({ type: 'log', message: msg }));
        try {
          await logAuditServer(createServiceClient() as never, {
            actor_id: authResult.user.id,
            actor_role: authResult.profile.effective_role,
          }, {
            action: 'matching.run',
            resourceType: 'candidate_job_matches',
            details: {
              candidate_id: body.candidate_id ?? null,
              total_matches_upserted: (result as { total_matches_upserted?: number })?.total_matches_upserted ?? null,
            },
          });
        } catch {
          // Matching run should not fail because audit logging fails.
        }
        apiLogger.info(
          {
            route: '/api/matches',
            mode: 'sync_sse',
            user_id: authResult.user.id,
            candidate_id: body.candidate_id ?? null,
            duration_ms: Date.now() - startedAt,
          },
          'matches sync run completed',
        );
        send({ type: 'complete', result });
      } catch (err: any) {
        apiLogger.error(
          {
            route: '/api/matches',
            mode: 'sync_sse',
            user_id: authResult.user.id,
            err: err?.message ?? String(err),
          },
          'matches sync run failed',
        );
        send({ type: 'error', message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const candidateId = req.nextUrl.searchParams.get('candidate_id') || undefined;
  try {
    return NextResponse.json(await runMatching(candidateId));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/matches
// Clears candidate_job_matches so matching can be re-run from scratch.
// ?all=true  → deletes every row (default when triggered from the panel)
// ?all=false → deletes only rows without an ats_score (title-match rows only)
export async function DELETE(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const deleteAll = req.nextUrl.searchParams.get('all') !== 'false'; // default true
  const supabase = createServiceClient();

  try {
    // Supabase requires at least one filter on DELETE to prevent accidental full-table wipes.
    // We use matched_at (the table's timestamp column) as the required condition.
    let del = supabase
      .from('candidate_job_matches')
      .delete()
      .lte('matched_at', new Date().toISOString()); // matches all rows

    if (!deleteAll) {
      del = (del as any).is('ats_score', null); // only title-match rows
    }

    const { error } = await del;
    if (error) throw new Error(error.message);

    try {
      await logAuditServer(supabase as never, {
        actor_id: authResult.user.id,
        actor_role: authResult.profile.effective_role,
      }, {
        action: 'matching.run',
        resourceType: 'candidate_job_matches',
        details: { operation: 'delete', mode: deleteAll ? 'all' : 'title_matches_only' },
      });
    } catch {
      // Delete should not fail because audit logging fails.
    }

    return NextResponse.json({ ok: true, mode: deleteAll ? 'all' : 'title_matches_only' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
