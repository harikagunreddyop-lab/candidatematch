import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { runDiscovery } from '@/discovery/discover';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { csvPath?: string; csvUrl?: string; csvContent?: string; useCompaniesTable?: boolean; limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const useCompaniesTable = body.useCompaniesTable === true;
  const hasCsv = (body.csvPath && typeof body.csvPath === 'string') ||
    (body.csvUrl && typeof body.csvUrl === 'string') ||
    (body.csvContent && typeof body.csvContent === 'string');
  if (!useCompaniesTable && !hasCsv) {
    return NextResponse.json(
      { error: 'Provide useCompaniesTable: true, or one of: csvPath, csvUrl, csvContent' },
      { status: 400 }
    );
  }

  const limit = typeof body.limit === 'number' ? body.limit : undefined;

  try {
    const summary = await runDiscovery({
      useCompaniesTable: useCompaniesTable || undefined,
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
