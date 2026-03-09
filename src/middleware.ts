import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { EffectiveRole } from '@/types';
import { cached } from '@/lib/redis-upstash';
import { authLogger } from '@/lib/logger';

const PROFILE_CACHE_TTL = 300; // 5 minutes

const ROLE_ROUTES: Record<string, (EffectiveRole | 'admin')[]> = {
  '/dashboard/admin':     ['platform_admin', 'admin'],
  '/dashboard/company':   ['platform_admin', 'company_admin', 'admin'],
  '/dashboard/recruiter': ['platform_admin', 'company_admin', 'recruiter', 'admin'],
  '/dashboard/candidate': ['candidate', 'platform_admin', 'admin'],
};

function getDestination(effectiveRole?: string, legacyRole?: string): string {
  const r = effectiveRole || legacyRole;
  if (r === 'platform_admin' || r === 'admin') return '/dashboard/admin';
  if (r === 'company_admin') return '/dashboard/company';
  if (r === 'recruiter') return '/dashboard/recruiter';
  if (r === 'candidate') return '/dashboard/candidate';
  return '/auth';
}

function addTracingHeaders(res: NextResponse, requestId: string, start: number): NextResponse {
  res.headers.set('x-request-id', requestId);
  res.headers.set('x-response-time', `${Date.now() - start}ms`);
  return res;
}

export async function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return addTracingHeaders(new NextResponse('Server misconfiguration: missing Supabase env', { status: 503 }), requestId, start);
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          // Refresh response to apply cookie changes
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Securely fetch user - validates JWT with Supabase Auth server
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  let error: Awaited<ReturnType<typeof supabase.auth.getUser>>['error'] = null;
  let shouldResetSupabaseCookies = false;
  try {
    const authResult = await supabase.auth.getUser();
    user = authResult.data.user;
    error = authResult.error;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Guard against corrupted serialized auth cookie/session shapes observed in runtime logs.
    shouldResetSupabaseCookies = message.includes("Cannot create property 'user' on string");
  }

  if (shouldResetSupabaseCookies) {
    const cleared = NextResponse.next({ request: { headers: requestHeaders } });
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith('sb-')) {
        cleared.cookies.set({ name: cookie.name, value: '', path: '/', maxAge: 0 });
      }
    }
    return addTracingHeaders(cleared, requestId, start);
  }

  const pathname = request.nextUrl.pathname;

  // Only warn when on a protected route and auth failed (e.g. expired/invalid session)
  if (error && pathname.startsWith('/dashboard')) {
    authLogger.warn({ error: error.message }, 'middleware auth warning');
  }

  // ── Not logged in → send to auth page ──────────────────────────────────
  if (pathname.startsWith('/dashboard') && !user) {
    return addTracingHeaders(NextResponse.redirect(new URL('/auth', request.url)), requestId, start);
  }
  if (pathname === '/pending-approval' && !user) {
    return addTracingHeaders(NextResponse.redirect(new URL('/auth', request.url)), requestId, start);
  }

  // ── Connect extension: candidates only (logged-in non-candidates → their dashboard) ──
  if (pathname === '/connect-extension' && user) {
    const profile = await cached(
      `mw:profile:${user.id}`,
      PROFILE_CACHE_TTL,
      async () => {
        const { data } = await supabase.from('profile_roles').select('legacy_role, effective_role').eq('id', user.id).single();
        return data;
      }
    );
    const role = profile?.legacy_role as string | undefined;
    const effectiveRole = profile?.effective_role as string | undefined;
    const activeRole = effectiveRole || role;
    if (activeRole && activeRole !== 'candidate') {
      const dest = getDestination(effectiveRole, role);
      return addTracingHeaders(NextResponse.redirect(new URL(dest, request.url)), requestId, start);
    }
  }

  // ── Logged in Logic ──────────────────────────────────────────────────────
  if (user) {
    // Fetch profile once with cache (avoids repeated DB calls)
    const profile = await cached(
      `mw:profile:${user.id}`,
      PROFILE_CACHE_TTL,
      async () => {
        const { data } = await supabase
          .from('profile_roles')
          .select('legacy_role, effective_role, company_id')
          .eq('id', user.id)
          .single();
        return data;
      }
    );

    const role = profile?.legacy_role as string | undefined;
    const effectiveRole = profile?.effective_role as string | undefined;
    const activeRole = effectiveRole || role;

    // ── No profile or role (e.g. not yet approved) → pending approval page ──
    if (!role && (pathname === '/auth' || pathname.startsWith('/dashboard'))) {
      if (pathname !== '/pending-approval') {
        return addTracingHeaders(NextResponse.redirect(new URL('/pending-approval', request.url)), requestId, start);
      }
      return addTracingHeaders(response, requestId, start);
    }

    // ── User with no role already on pending-approval → stay there ──
    if (!role && pathname === '/pending-approval') {
      return addTracingHeaders(response, requestId, start);
    }

    // ── Already approved user on pending-approval page → send to dashboard ──
    if (pathname === '/pending-approval' && role) {
      const dest = getDestination(effectiveRole, role);
      return addTracingHeaders(NextResponse.redirect(new URL(dest, request.url)), requestId, start);
    }

    // ── On auth page → redirect to correct dashboard ──────────────
    if (pathname === '/auth') {
      const dest = getDestination(effectiveRole, role);
      return addTracingHeaders(NextResponse.redirect(new URL(dest, request.url)), requestId, start);
    }

    // ── On a dashboard route → check permissions ───────────────────────────
    if (pathname.startsWith('/dashboard')) {
      const matchedPrefix = Object.keys(ROLE_ROUTES).find(prefix => pathname.startsWith(prefix));

      // Role Check: If route is protected and user has a role
      if (matchedPrefix && activeRole) {
        const allowedRoles = ROLE_ROUTES[matchedPrefix];
        if (!allowedRoles.includes(activeRole as EffectiveRole | 'admin')) {
          const dest = getDestination(effectiveRole, role);
          return addTracingHeaders(NextResponse.redirect(new URL(dest, request.url)), requestId, start);
        }
      }

      // /dashboard root → redirect to role-specific dashboard
      if (pathname === '/dashboard' && activeRole) {
        const dest = getDestination(effectiveRole, role);
        return addTracingHeaders(NextResponse.redirect(new URL(dest, request.url)), requestId, start);
      }

      // ── First-time users → welcome / setup page (once per role) ──
      const welcomeUrls: Record<string, string> = {
        candidate: '/dashboard/candidate/welcome',
        recruiter: '/dashboard/recruiter/welcome',
        company_admin: '/dashboard/company/setup',
      };
      const welcomeUrl = welcomeUrls[activeRole as string];
      const isFirstVisit = !request.cookies.get('welcome_shown')?.value;
      if (isFirstVisit && welcomeUrl && pathname !== welcomeUrl) {
        const redirectResp = NextResponse.redirect(new URL(welcomeUrl, request.url));
        redirectResp.cookies.set('welcome_shown', 'true', {
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
        });
        return addTracingHeaders(redirectResp, requestId, start);
      }

      // ── Candidate Access Gates (self-service: onboarding allowed, no recruiter required) ──
      const isCandidate = activeRole === 'candidate';
      const isCandidateDashboard = pathname.startsWith('/dashboard/candidate');
      const isOnboardingPage = pathname === '/dashboard/candidate/onboarding';
      const isWaitingPage = pathname === '/dashboard/candidate/waiting';

      if (isCandidate && isCandidateDashboard) {
        // Always allow onboarding page
        if (isOnboardingPage) {
          return addTracingHeaders(response, requestId, start);
        }

        let { data: candidate } = await supabase
          .from('candidates')
          .select('id, onboarding_completed')
          .eq('user_id', user.id)
          .single();

        // Auto-link: if no candidate found by user_id, try email match
        if (!candidate && user.email) {
          const { data: orphan } = await supabase
            .from('candidates')
            .select('id, onboarding_completed')
            .eq('email', user.email)
            .is('user_id', null)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

          if (orphan) {
            await supabase
              .from('candidates')
              .update({ user_id: user.id })
              .eq('id', orphan.id);
            candidate = orphan;
          }
        }

        // No candidate record at all → send to onboarding to create one
        if (!candidate) {
          if (!isOnboardingPage) {
            return addTracingHeaders(NextResponse.redirect(new URL('/dashboard/candidate/onboarding', request.url)), requestId, start);
          }
          return addTracingHeaders(response, requestId, start);
        }

        // Candidate exists but hasn't completed onboarding → send to onboarding
        if (!candidate.onboarding_completed && !isOnboardingPage) {
          return addTracingHeaders(NextResponse.redirect(new URL('/dashboard/candidate/onboarding', request.url)), requestId, start);
        }
      }

      // B2B SaaS: No waiting page needed, candidates access dashboard after onboarding
      if (isCandidate && isWaitingPage) {
        // If onboarding complete, redirect to dashboard
        let { data: candidate } = await supabase
          .from('candidates')
          .select('id, onboarding_completed')
          .eq('user_id', user.id)
          .single();

        if (!candidate && user.email) {
          const { data: orphan } = await supabase
            .from('candidates')
            .select('id, onboarding_completed')
            .eq('email', user.email)
            .is('user_id', null)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (orphan) {
            await supabase.from('candidates').update({ user_id: user.id }).eq('id', orphan.id);
            candidate = orphan;
          }
        }

        // If onboarding complete, send to dashboard
        if (candidate?.onboarding_completed) {
          return addTracingHeaders(NextResponse.redirect(new URL('/dashboard/candidate', request.url)), requestId, start);
        }

        // Otherwise send to onboarding
        return addTracingHeaders(NextResponse.redirect(new URL('/dashboard/candidate/onboarding', request.url)), requestId, start);
      }
    }
  }

  return addTracingHeaders(response, requestId, start);
}

export const config = {
  matcher: ['/auth', '/dashboard/:path*', '/pending-approval', '/connect-extension'],
};