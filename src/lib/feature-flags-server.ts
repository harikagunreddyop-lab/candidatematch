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
  const [roleRes, userRes, appSettingsRes] = await Promise.all([
    supabase.from('feature_flags').select('key, value, role').or(`role.eq.${role},role.is.null`),
    supabase.from('user_feature_flags').select('key, enabled').eq('user_id', userId),
    supabase.from('app_settings').select('key, value').in('key', ['feature_candidate_saved_jobs', 'feature_candidate_reminders', 'feature_candidate_export']),
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
  // app_settings global kill switch for candidates
  if (role === 'candidate' && appSettingsRes.data?.length) {
    const appMap: Record<string, boolean> = {};
    for (const d of appSettingsRes.data as { key: string; value?: { value?: unknown } }[]) {
      const v = d.value?.value;
      appMap[d.key] = v === true || v === 'true';
    }
    if (appMap['feature_candidate_saved_jobs'] === false) flags.candidate_save_jobs = false;
    if (appMap['feature_candidate_reminders'] === false) flags.candidate_reminders = false;
    if (appMap['feature_candidate_export'] === false) flags.candidate_export_data = false;
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
