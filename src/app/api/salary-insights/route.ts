/**
 * GET /api/salary-insights?title=...&location=...
 * Returns market salary range from external provider (e.g. Adzuna) when configured.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMarketSalary } from '@/lib/salary-api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title')?.trim();
  const location = searchParams.get('location')?.trim() || undefined;

  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }

  const result = await getMarketSalary(title, location);
  if (!result) {
    return NextResponse.json({ market: null });
  }
  return NextResponse.json({ market: result });
}
