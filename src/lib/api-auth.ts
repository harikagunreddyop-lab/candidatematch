import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Role } from '@/types';

export interface ApiAuthResult {
  user: { id: string; email?: string };
  profile: { id: string; role: Role };
  supabase: ReturnType<typeof createServerClient>;
}

/** Create Supabase server client from request cookies (for API routes). */
export function createServerSupabaseFromRequest(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
}

/**
 * Get authenticated user + profile for API routes.
 * Returns a 401 Response if not logged in, or 403 if role is required and not allowed.
 */
export async function requireApiAuth(
  req: NextRequest,
  options?: { roles?: Role[] }
): Promise<ApiAuthResult | NextResponse> {
  const supabase = createServerSupabaseFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profileRow) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const profile = { id: profileRow.id, role: profileRow.role as Role };
  if (options?.roles?.length && !options.roles.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { user, profile, supabase };
}

/**
 * Require admin only. Returns 401/403 Response or { user, profile, supabase }.
 */
export async function requireAdmin(req: NextRequest): Promise<ApiAuthResult | NextResponse> {
  return requireApiAuth(req, { roles: ['admin'] });
}

/**
 * Require recruiter or admin.
 */
export async function requireRecruiterOrAdmin(req: NextRequest): Promise<ApiAuthResult | NextResponse> {
  return requireApiAuth(req, { roles: ['admin', 'recruiter'] });
}

/**
 * Check if the current user can access the given candidate_id.
 * - Admin: always
 * - Recruiter: must be assigned to that candidate
 * - Candidate: must be their own candidate_id (user_id match)
 * Uses service client for assignment check. Call after requireApiAuth; pass the auth supabase only for profile.
 */
export async function canAccessCandidate(
  auth: ApiAuthResult,
  candidateId: string,
  serviceSupabase: ReturnType<typeof import('@/lib/supabase-server').createServiceClient>
): Promise<boolean> {
  if (auth.profile.role === 'admin') return true;
  if (auth.profile.role === 'candidate') {
    const { data: c } = await serviceSupabase
      .from('candidates')
      .select('id')
      .eq('id', candidateId)
      .eq('user_id', auth.user.id)
      .single();
    return !!c;
  }
  if (auth.profile.role === 'recruiter') {
    const { data: assignment } = await serviceSupabase
      .from('recruiter_candidate_assignments')
      .select('recruiter_id')
      .eq('candidate_id', candidateId)
      .eq('recruiter_id', auth.profile.id)
      .single();
    return !!assignment;
  }
  return false;
}
