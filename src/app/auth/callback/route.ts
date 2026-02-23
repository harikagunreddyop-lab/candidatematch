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

        if (userEmail) {
          try {
            const service = createServiceClient();

            const { data: linkedCandidate } = await service
              .from('candidates')
              .select('id')
              .eq('user_id', userId)
              .maybeSingle();

            if (!linkedCandidate) {
              const { data: orphan } = await service
                .from('candidates')
                .select('id')
                .eq('email', userEmail)
                .is('user_id', null)
                .order('active', { ascending: false })
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (orphan) {
                await service
                  .from('candidates')
                  .update({ user_id: userId })
                  .eq('id', orphan.id);

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
            // Non-critical: orphan linking failed but login should still proceed
          }
        }

        return NextResponse.redirect(new URL('/auth/complete', origin));
      }
    } catch {
      // Exchange failed — redirect to login with error
    }
  }

  return NextResponse.redirect(new URL('/?error=auth', origin));
}
