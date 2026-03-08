import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Role, EffectiveRole } from '@/types';
import type { AuthContext } from '@/lib/auth-context';
import { isPlatformAdmin } from '@/lib/auth-context';

export interface ApiAuthResult {
  user: { id: string; email?: string };
  profile: AuthContext & { role: Role };
  supabase: ReturnType<typeof createServerClient>;
}

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
 * Authenticate API request. Supports both legacy Role[] and new EffectiveRole[].
 * All existing callers using roles: ['admin','recruiter','candidate'] continue to work.
 * 'admin' in roles array matches both 'admin' legacy AND 'platform_admin'/'company_admin' effective roles.
 */
export async function requireApiAuth(
  req: NextRequest,
  options?: { roles?: Role[]; effectiveRoles?: EffectiveRole[] }
): Promise<ApiAuthResult | NextResponse> {
  const supabase = createServerSupabaseFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profileRow } = await supabase
    .from('profile_roles')
    .select('id, legacy_role, effective_role, company_id')
    .eq('id', user.id)
    .single();

  if (!profileRow) return NextResponse.json({ error: 'Profile not found' }, { status: 403 });

  const legacyRole = profileRow.legacy_role as Role;
  const effectiveRole = profileRow.effective_role as EffectiveRole;

  // Check effectiveRoles (new system)
  if (options?.effectiveRoles?.length) {
    if (!options.effectiveRoles.includes(effectiveRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Check legacy roles (backwards compat)
  // 'admin' in the legacy list = matches platform_admin OR company_admin
  if (options?.roles?.length && !options?.effectiveRoles?.length) {
    const legacyMatch = options.roles.some(r => {
      if (r === 'admin') return effectiveRole === 'platform_admin' || effectiveRole === 'company_admin' || legacyRole === 'admin';
      return r === legacyRole || r === effectiveRole;
    });
    if (!legacyMatch) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return {
    user,
    profile: {
      id: profileRow.id,
      role: legacyRole,
      effective_role: effectiveRole,
      company_id: profileRow.company_id ?? null,
    },
    supabase,
  };
}

export async function requireAdmin(req: NextRequest): Promise<ApiAuthResult | NextResponse> {
  return requireApiAuth(req, { roles: ['admin'] });
}

export async function requireRecruiterOrAdmin(req: NextRequest): Promise<ApiAuthResult | NextResponse> {
  return requireApiAuth(req, { roles: ['admin', 'recruiter'] });
}

export async function canAccessCandidate(
  auth: ApiAuthResult,
  candidateId: string,
  serviceSupabase: ReturnType<typeof import('@/lib/supabase-server').createServiceClient>
): Promise<boolean> {
  if (isPlatformAdmin(auth.profile)) return true;
  const role = auth.profile.effective_role;
  if (role === 'company_admin') {
    // Company admin can access candidates applied to their company's jobs
    const { data } = await serviceSupabase
      .from('candidate_activity')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('company_id', auth.profile.company_id)
      .limit(1)
      .maybeSingle();
    return !!data;
  }
  if (role === 'candidate') {
    const { data: c } = await serviceSupabase
      .from('candidates').select('id').eq('id', candidateId).eq('user_id', auth.user.id).single();
    return !!c;
  }
  if (role === 'recruiter') {
    // B2B: recruiter can access candidate if candidate has match or application for a job they posted
    const { data: myJobs } = await serviceSupabase
      .from('jobs')
      .select('id')
      .eq('posted_by', auth.profile.id);
    const jobIds = (myJobs || []).map((j: { id: string }) => j.id);
    if (jobIds.length === 0) return false;
    const { data: match } = await serviceSupabase
      .from('candidate_job_matches')
      .select('id')
      .eq('candidate_id', candidateId)
      .in('job_id', jobIds)
      .limit(1)
      .maybeSingle();
    if (match) return true;
    const { data: app } = await serviceSupabase
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateId)
      .in('job_id', jobIds)
      .limit(1)
      .maybeSingle();
    return !!app;
  }
  return false;
}
