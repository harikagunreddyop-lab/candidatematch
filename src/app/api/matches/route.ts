import { NextRequest, NextResponse } from 'next/server';
import { runMatching } from '@/lib/matching';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const body = await req.json().catch(() => ({}));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (d: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
      try {
        const result = await runMatching(body.candidate_id, (msg) => send({ type: 'log', message: msg }));
        send({ type: 'complete', result });
      } catch (err: any) {
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

    return NextResponse.json({ ok: true, mode: deleteAll ? 'all' : 'title_matches_only' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
