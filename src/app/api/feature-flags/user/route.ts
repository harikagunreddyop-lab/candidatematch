import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/feature-flags/user?user_id=...
 * Admin: fetch per-user feature flag overrides for a specific user.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const userId = req.nextUrl.searchParams.get('user_id');
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_feature_flags')
    .select('key, enabled')
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Return as a flat map: { key: boolean }
  const flags: Record<string, boolean> = {};
  for (const row of data ?? []) {
    flags[row.key] = row.enabled;
  }
  return NextResponse.json({ flags });
}

/**
 * PATCH /api/feature-flags/user
 * Admin: upsert per-user feature flag overrides.
 * Body: { user_id: string, flags: Record<string, boolean> }
 */
export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const body = await req.json().catch(() => null);
  if (!body?.user_id || typeof body.flags !== 'object') {
    return NextResponse.json({ error: 'user_id and flags required' }, { status: 400 });
  }

  const { user_id, flags } = body as { user_id: string; flags: Record<string, boolean> };
  const supabase = createServiceClient();

  const rows = Object.entries(flags).map(([key, enabled]) => ({
    user_id,
    key,
    enabled: Boolean(enabled),
    updated_at: new Date().toISOString(),
  }));

  if (rows.length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabase
    .from('user_feature_flags')
    .upsert(rows, { onConflict: 'user_id,key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
