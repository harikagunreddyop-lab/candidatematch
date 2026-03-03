/**
 * Server-side feature flag resolution.
 * Merges role-level feature_flags with per-user user_feature_flags.
 */

import type { Role } from '@/types';

export async function getFeatureFlags(
  supabase: { from: (t: string) => any },
  userId: string,
  role: Role
): Promise<Record<string, boolean>> {
  const [roleRes, userRes] = await Promise.all([
    supabase.from('feature_flags').select('key, value, role').or(`role.eq.${role},role.is.null`),
    supabase.from('user_feature_flags').select('key, enabled').eq('user_id', userId),
  ]);

  const flags: Record<string, boolean> = {};
  const rows = (roleRes.data ?? []).slice().sort(
    (a: { role: string | null }, b: { role: string | null }) => (a.role ? 0 : 1) - (b.role ? 0 : 1)
  );
  for (const row of rows) {
    const v = row.value;
    flags[row.key] = v === true || v === 'true' || (typeof v === 'object' && (v as any)?.enabled === true);
  }
  for (const row of userRes.data ?? []) {
    flags[row.key] = row.enabled;
  }
  return flags;
}

export async function hasFeature(
  supabase: { from: (t: string) => any },
  userId: string,
  role: Role,
  key: string,
  defaultWhenMissing = false
): Promise<boolean> {
  const flags = await getFeatureFlags(supabase, userId, role);
  return flags[key] !== undefined ? flags[key] : defaultWhenMissing;
}
