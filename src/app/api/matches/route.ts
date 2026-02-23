import { NextRequest, NextResponse } from 'next/server';
import { runMatching } from '@/lib/matching';
import { requireAdmin } from '@/lib/api-auth';

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
