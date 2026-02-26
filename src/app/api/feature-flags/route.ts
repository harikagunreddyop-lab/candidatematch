import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/** GET — returns feature flags for the current user's role merged with per-user overrides. */
export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;
  const role = authResult.profile.role;

  const supabase = createServiceClient();
  const [roleFlags, userFlags] = await Promise.all([
    supabase
      .from('feature_flags')
      .select('key, value, role')
      .or('role.eq.' + role + ',role.is.null'),
    supabase
      .from('user_feature_flags')
      .select('key, enabled')
      .eq('user_id', authResult.user.id),
  ]);

  if (roleFlags.error) return NextResponse.json({ error: roleFlags.error.message }, { status: 400 });

  // 1. Build base from role-level flags (null-role = global, role-specific overrides global)
  const flags: Record<string, boolean> = {};
  const rows = (roleFlags.data ?? []).slice().sort(
    (a: { role: string | null }, b: { role: string | null }) => (a.role ? 0 : 1) - (b.role ? 0 : 1)
  );
  for (const row of rows) {
    const v = row.value;
    flags[row.key] = v === true || v === 'true' || (typeof v === 'object' && (v as any)?.enabled === true);
  }

  // 2. Apply per-user overrides (highest priority)
  for (const row of userFlags.data ?? []) {
    flags[row.key] = row.enabled;
  }

  return NextResponse.json(flags);
}
