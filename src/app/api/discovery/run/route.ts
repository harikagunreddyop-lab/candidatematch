import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { runDiscovery } from '@/discovery/discover';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { csvPath?: string; csvUrl?: string; csvContent?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const hasInput = (body.csvPath && typeof body.csvPath === 'string') ||
    (body.csvUrl && typeof body.csvUrl === 'string') ||
    (body.csvContent && typeof body.csvContent === 'string');
  if (!hasInput) {
    return NextResponse.json(
      { error: 'Provide one of: csvPath, csvUrl, or csvContent' },
      { status: 400 }
    );
  }

  const limit = typeof body.limit === 'number' ? body.limit : undefined;

  try {
    const summary = await runDiscovery({
      csvPath: body.csvPath,
      csvUrl: body.csvUrl,
      csvContent: body.csvContent,
      limit,
    });
    return NextResponse.json(summary);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
