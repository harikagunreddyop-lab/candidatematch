import { createServerSupabase } from './supabase-server';
import { redirect } from 'next/navigation';
import type { Profile, Role } from '@/types';

/** Prefer getProfile() for server-side checks. getSession() reads from storage and is not re-validated with Supabase. */
export async function getSession() {
  const supabase = createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getProfile(): Promise<Profile | null> {
  try {
    const supabase = createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, avatar_url, created_at, updated_at')
      .eq('id', user.id)
      .single();

    if (error || !data) return null;
    return data as Profile;
  } catch {
    return null;
  }
}

export async function requireAuth(): Promise<Profile> {
  try {
    const profile = await getProfile();
    if (!profile) redirect('/');
    return profile;
  } catch (e) {
    console.error('[requireAuth]', e);
    redirect('/');
  }
}

export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await requireAuth();
  if (!roles.includes(profile.role)) redirect('/dashboard');
  return profile;
}

export function getRoleDashboardPath(role: Role): string {
  switch (role) {
    case 'admin': return '/dashboard/admin';
    case 'recruiter': return '/dashboard/recruiter';
    case 'candidate': return '/dashboard/candidate';
    default: return '/';
  }
}
