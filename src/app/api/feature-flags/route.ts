import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

/** GET — returns feature flags for the current user's role (and role=null for all). */
export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;
  const role = authResult.profile.role;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('feature_flags')
    .select('key, value, role')
    .or('role.eq.' + role + ',role.is.null');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const flags: Record<string, boolean> = {};
  const rows = (data ?? []).slice().sort((a: { role: string | null }, b: { role: string | null }) => (a.role ? 0 : 1) - (b.role ? 0 : 1));
  for (const row of rows) {
    const v = row.value;
    flags[row.key] = v === true || v === 'true' || (typeof v === 'object' && (v as any)?.enabled === true);
  }
  return NextResponse.json(flags);
}
