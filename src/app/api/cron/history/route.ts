import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/api-auth';

/** GET — admin: last cron run and recent history (e.g. last 10). */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 10, 50);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('cron_run_history')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ runs: data ?? [] });
}
