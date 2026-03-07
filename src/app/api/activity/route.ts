/**
 * GET /api/activity — List activity_log entries (RLS applies: platform_admin all, company members own company).
 * Query: limit (default 100), offset (default 0).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 100));
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0);

  const { data: rows, error } = await auth.supabase
    .from('activity_log')
    .select('id, company_id, user_id, action, resource_type, resource_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = rows ?? [];
  const userIds = Array.from(new Set(entries.map((e: { user_id?: string | null }) => e.user_id).filter(Boolean))) as string[];
  let names: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await auth.supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIds);
    if (profiles) names = Object.fromEntries(profiles.map((p: { id: string; name?: string | null }) => [p.id, p.name ?? p.id.slice(0, 8)]));
  }

  const list = entries.map((e: { user_id?: string | null; [k: string]: unknown }) => ({
    ...e,
    actor_name: e.user_id ? (names[e.user_id] ?? null) : null,
  }));

  return NextResponse.json({ entries: list });
}
