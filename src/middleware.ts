import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Which roles are allowed on which route prefixes
// Added 'admin' to candidate routes for oversight capabilities
const ROLE_ROUTES: Record<string, string[]> = {
  '/dashboard/admin': ['admin'],
  '/dashboard/recruiter': ['recruiter', 'admin'],
  '/dashboard/candidate': ['candidate', 'admin'],
};

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse('Server misconfiguration: missing Supabase env', { status: 503 });
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

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
  const { data: { user }, error } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Only warn when on a protected route and auth failed (e.g. expired/invalid session)
  if (error && pathname.startsWith('/dashboard')) {
    console.warn('Middleware Auth Warning:', error.message);
  }

  // ── Not logged in → send to auth page ──────────────────────────────────
  if (pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }
  if (pathname === '/pending-approval' && !user) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  // ── Logged in Logic ──────────────────────────────────────────────────────
  if (user) {
    // Fetch role once
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile?.role as string | undefined;

    // ── No profile or role (e.g. not yet approved) → pending approval page ──
    if (!role && (pathname === '/auth' || pathname.startsWith('/dashboard'))) {
      if (pathname !== '/pending-approval') {
        return NextResponse.redirect(new URL('/pending-approval', request.url));
      }
      return response;
    }

    // ── User with no role already on pending-approval → stay there ──
    if (!role && pathname === '/pending-approval') {
      return response;
    }

    // ── Already approved user on pending-approval page → send to dashboard ──
    if (pathname === '/pending-approval' && role) {
      const dest = role === 'admin' ? '/dashboard/admin'
        : role === 'recruiter' ? '/dashboard/recruiter'
          : '/dashboard/candidate';
      return NextResponse.redirect(new URL(dest, request.url));
    }

    // ── On auth page → redirect to correct dashboard ──────────────
    if (pathname === '/auth') {
      const dest = role === 'admin' ? '/dashboard/admin'
        : role === 'recruiter' ? '/dashboard/recruiter'
          : '/dashboard/candidate';
      return NextResponse.redirect(new URL(dest, request.url));
    }

    // ── On a dashboard route → check permissions ───────────────────────────
    if (pathname.startsWith('/dashboard')) {
      const matchedPrefix = Object.keys(ROLE_ROUTES).find(prefix => pathname.startsWith(prefix));

      // Role Check: If route is protected and user has a role
      if (matchedPrefix && role) {
        const allowedRoles = ROLE_ROUTES[matchedPrefix];
        if (!allowedRoles.includes(role)) {
          // User tried to access a route they don't belong to
          const dest = role === 'admin' ? '/dashboard/admin'
            : role === 'recruiter' ? '/dashboard/recruiter'
              : '/dashboard/candidate';
          return NextResponse.redirect(new URL(dest, request.url));
        }
      }

      // /dashboard root → redirect to role-specific dashboard
      if (pathname === '/dashboard' && role) {
        const dest = role === 'admin' ? '/dashboard/admin'
          : role === 'recruiter' ? '/dashboard/recruiter'
            : '/dashboard/candidate';
        return NextResponse.redirect(new URL(dest, request.url));
      }

      // ── Candidate Access Gates (self-service: onboarding allowed, no recruiter required) ──
      const isCandidate = role === 'candidate';
      const isCandidateDashboard = pathname.startsWith('/dashboard/candidate');
      const isOnboardingPage = pathname === '/dashboard/candidate/onboarding';
      const isWaitingPage = pathname === '/dashboard/candidate/waiting';

      if (isCandidate && isCandidateDashboard) {
        // Always allow onboarding page
        if (isOnboardingPage) {
          return response;
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
            return NextResponse.redirect(new URL('/dashboard/candidate/onboarding', request.url));
          }
          return response;
        }

        // Candidate exists but hasn't completed onboarding → send to onboarding
        if (!candidate.onboarding_completed && !isOnboardingPage && !isWaitingPage) {
          return NextResponse.redirect(new URL('/dashboard/candidate/onboarding', request.url));
        }
      }

      // If candidate is on waiting page but has recruiter assigned → send to dashboard
      if (isCandidate && isWaitingPage) {
        let { data: candidate } = await supabase
          .from('candidates')
          .select('id')
          .eq('user_id', user.id)
          .single();

        // Auto-link by email on waiting page too
        if (!candidate && user.email) {
          const { data: orphan } = await supabase
            .from('candidates')
            .select('id')
            .eq('email', user.email)
            .is('user_id', null)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();
          if (orphan) {
            await supabase.from('candidates').update({ user_id: user.id }).eq('id', orphan.id);
            candidate = orphan;
          }
        }

        if (candidate) {
          const { count } = await supabase
            .from('recruiter_candidate_assignments')
            .select('recruiter_id', { count: 'exact', head: true })
            .eq('candidate_id', candidate.id);

          if (count && count > 0) {
            return NextResponse.redirect(new URL('/dashboard/candidate', request.url));
          }
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/auth', '/dashboard/:path*', '/pending-approval'],
};