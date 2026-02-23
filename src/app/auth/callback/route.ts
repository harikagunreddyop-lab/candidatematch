import { createServerSupabase, createServiceClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    try {
      const supabase = createServerSupabase();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data.session) {
        const userId = data.session.user.id;
        const userEmail = data.session.user.email;

        // Link orphaned candidate records:
        // When admin creates a candidate with email but the user hasn't signed up yet,
        // the candidate row has user_id=null. Link it now on first login.
        if (userEmail) {
          try {
            const service = createServiceClient();

            // Check if this user already has a linked candidate
            const { data: linkedCandidate } = await service
              .from('candidates')
              .select('id')
              .eq('user_id', userId)
              .single();

            if (!linkedCandidate) {
              // No candidate linked — find orphan by email and link it
              const { data: orphan } = await service
                .from('candidates')
                .select('id')
                .eq('email', userEmail)
                .is('user_id', null)
                .order('active', { ascending: false })
                .order('updated_at', { ascending: false })
                .limit(1)
                .single();

              if (orphan) {
                await service
                  .from('candidates')
                  .update({ user_id: userId })
                  .eq('id', orphan.id);

                // Delete any duplicate empty candidate that was auto-created
                const { data: duplicates } = await service
                  .from('candidates')
                  .select('id, full_name, skills, experience')
                  .eq('user_id', userId)
                  .neq('id', orphan.id);

                if (duplicates?.length) {
                  for (const dup of duplicates) {
                    const isEmpty = !dup.skills || (Array.isArray(dup.skills) && dup.skills.length === 0) || JSON.stringify(dup.skills) === '{}';
                    const noExp = !dup.experience || (Array.isArray(dup.experience) && dup.experience.length === 0);
                    if (isEmpty && noExp) {
                      await service.from('candidates').delete().eq('id', dup.id);
                    }
                  }
                }
              }
            }
          } catch {
            // Non-critical: linking failed but login should still proceed
          }
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        const role = profile?.role;
        const dest = role === 'admin' ? '/dashboard/admin'
                   : role === 'recruiter' ? '/dashboard/recruiter'
                   : '/dashboard/candidate';

        // Redirect to client completion page so the browser picks up the session cookie
        // before navigating to dashboard (fixes OAuth "first click shows login again" issue)
        return NextResponse.redirect(new URL('/auth/complete', origin));
      }
    } catch {
      // Env missing or exchange failed — do not expose details
    }
  }

  return NextResponse.redirect(new URL('/?error=auth', origin));
}