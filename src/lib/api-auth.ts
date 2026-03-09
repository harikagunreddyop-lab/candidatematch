import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Role, EffectiveRole } from '@/types';
import type { AuthContext } from '@/lib/auth-context';
import { isPlatformAdmin } from '@/lib/auth-context';
import { createServiceClient } from '@/lib/supabase-server';
import { config } from '@/config';

export interface ApiAuthResult {
  user: { id: string; email?: string };
  profile: AuthContext & { role: Role };
  supabase: ReturnType<typeof createServerClient>;
}

function toNormalizedLegacyRole(effectiveRole: EffectiveRole, legacyRole: Role): Role {
  if (effectiveRole === 'platform_admin' || effectiveRole === 'company_admin') return 'admin';
  if (effectiveRole === 'recruiter') return 'recruiter';
  if (effectiveRole === 'candidate') return 'candidate';
  return legacyRole;
}

async function resolveCompanyContext(params: {
  userId: string;
  companyId: string | null;
  effectiveRole: EffectiveRole;
}): Promise<string | null> {
  const { userId, companyId, effectiveRole } = params;
  if (companyId) return companyId;
  // Platform admins may not belong to a company; only recover missing context for company staff.
  if (!['company_admin', 'recruiter'].includes(effectiveRole)) return null;

  try {
    const service = createServiceClient();

    const { data: perf } = await service
      .from('recruiter_performance')
      .select('company_id')
      .eq('recruiter_id', userId)
      .limit(1)
      .maybeSingle();
    const fromPerformance = perf?.company_id ?? null;
    if (fromPerformance) {
      await service.from('profiles').update({ company_id: fromPerformance }).eq('id', userId);
      return fromPerformance;
    }

    const { data: job } = await service
      .from('jobs')
      .select('company_id')
      .eq('posted_by', userId)
      .not('company_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const fromJobs = job?.company_id ?? null;
    if (fromJobs) {
      await service.from('profiles').update({ company_id: fromJobs }).eq('id', userId);
      return fromJobs;
    }
  } catch {
    // Non-fatal: if recovery fails, downstream routes may still return "No company context".
  }

  return null;
}

export function createServerSupabaseFromRequest(req: NextRequest) {
  return createServerClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
  const normalizedRole = toNormalizedLegacyRole(effectiveRole, legacyRole);
  const resolvedCompanyId = await resolveCompanyContext({
    userId: user.id,
    companyId: profileRow.company_id ?? null,
    effectiveRole,
  });

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
      role: normalizedRole,
      effective_role: effectiveRole,
      company_id: resolvedCompanyId,
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
    // B2B: recruiter can access candidate if candidate has match or application for company jobs.
    if (!auth.profile.company_id) return false;
    const { data: companyJobs } = await serviceSupabase
      .from('jobs')
      .select('id')
      .eq('company_id', auth.profile.company_id);
    const jobIds = (companyJobs || []).map((j: { id: string }) => j.id);
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
