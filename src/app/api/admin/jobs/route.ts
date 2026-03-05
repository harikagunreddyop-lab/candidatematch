import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Server-side jobs fetch for admin. Bypasses browser caching and returns fresh data.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10));
  const source = searchParams.get('source') ?? 'all';
  const pageSize = 10;

  const supabase = createServiceClient();

  let listQ = supabase
    .from('jobs')
    .select('*')
    .order('scraped_at', { ascending: false });

  let countQ = supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true });

  if (source !== 'all') {
    listQ = listQ.eq('source', source);
    countQ = countQ.eq('source', source);
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const [listRes, countRes] = await Promise.all([
    listQ.range(from, to),
    countQ,
  ]);

  if (listRes.error) {
    return NextResponse.json({ error: listRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    jobs: listRes.data ?? [],
    totalCount: countRes.count ?? 0,
  });
}
