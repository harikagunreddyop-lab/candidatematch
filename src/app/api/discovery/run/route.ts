import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { runDiscovery } from '@/discovery/discover';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { csvPath?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.csvPath || typeof body.csvPath !== 'string') {
    return NextResponse.json({ error: 'csvPath is required' }, { status: 400 });
  }

  const limit = typeof body.limit === 'number' ? body.limit : undefined;

  try {
    const summary = await runDiscovery({ csvPath: body.csvPath, limit });
    return NextResponse.json(summary);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
