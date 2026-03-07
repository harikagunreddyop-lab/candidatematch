import { createServerSupabase } from './supabase-server';
import { redirect } from 'next/navigation';
import type { Profile, Role, EffectiveRole, ProfileWithRole, Company } from '@/types';

/** Raw profile — for backwards compat in existing server components */
export async function getProfile(): Promise<Profile | null> {
  try {
    const supabase = createServerSupabase();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, role, effective_role, company_id, avatar_url, permissions, created_at, updated_at')
      .eq('id', user.id)
      .single();
    if (!data) return null;
    return data as Profile;
  } catch { return null; }
}

/** Full profile with resolved effective_role + optional company — USE THIS EVERYWHERE NEW */
export async function getProfileWithRole(): Promise<ProfileWithRole | null> {
  try {
    const supabase = createServerSupabase();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const { data } = await supabase
      .from('profile_roles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (!data) return null;

    let company: Company | undefined;
    if (data.company_id) {
      const { data: co } = await supabase
        .from('companies').select('*').eq('id', data.company_id).single();
      company = co || undefined;
    }
    return { ...data, company } as ProfileWithRole;
  } catch { return null; }
}

/** Redirects to /auth if not logged in */
export async function requireAuth(): Promise<ProfileWithRole> {
  const profile = await getProfileWithRole();
  if (!profile) redirect('/auth');
  return profile;
}

/** Require one or more effective roles */
export async function requireEffectiveRole(roles: EffectiveRole[]): Promise<ProfileWithRole> {
  const profile = await requireAuth();
  if (!roles.includes(profile.effective_role as EffectiveRole)) {
    redirect(getDashboardPath(profile.effective_role as EffectiveRole));
  }
  return profile;
}

/** Backwards-compatible — maps legacy Role to effective check */
export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await requireAuth();
  // Map effective → legacy for backwards compat
  const legacyRole: Role =
    profile.effective_role === 'platform_admin' ? 'admin' :
    profile.effective_role === 'company_admin'  ? 'admin' :
    profile.effective_role as Role;
  if (!roles.includes(legacyRole)) redirect('/dashboard');
  return profile as unknown as Profile;
}

export async function requirePlatformAdmin(): Promise<ProfileWithRole> {
  return requireEffectiveRole(['platform_admin']);
}

export async function requireCompanyAdmin(): Promise<ProfileWithRole> {
  return requireEffectiveRole(['platform_admin', 'company_admin']);
}

export async function requireCompanyStaff(): Promise<ProfileWithRole> {
  return requireEffectiveRole(['platform_admin', 'company_admin', 'recruiter']);
}

export function getDashboardPath(role: EffectiveRole | string): string {
  switch (role) {
    case 'platform_admin': return '/dashboard/admin';
    case 'company_admin':  return '/dashboard/company';
    case 'recruiter':      return '/dashboard/recruiter';
    case 'candidate':      return '/dashboard/candidate';
    default:               return '/dashboard';
  }
}

// Backwards compat
export function getRoleDashboardPath(role: Role): string {
  switch (role) {
    case 'admin':     return '/dashboard/admin';
    case 'recruiter': return '/dashboard/recruiter';
    case 'candidate': return '/dashboard/candidate';
    default:          return '/';
  }
}

export async function getSession() {
  const supabase = createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
