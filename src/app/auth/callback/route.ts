import { createServerSupabase } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type'); // 'recovery' for password reset

  if (code) {
    try {
      const supabase = createServerSupabase();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data.session) {
        if (type === 'recovery') {
          return NextResponse.redirect(new URL('/auth/reset-password', origin));
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.session.user.id)
          .single();

        const role = profile?.role;
        const dest = role === 'admin' ? '/dashboard/admin'
                   : role === 'recruiter' ? '/dashboard/recruiter'
                   : '/dashboard/candidate';

        return NextResponse.redirect(new URL(dest, origin));
      }
    } catch {
      // Env missing or exchange failed — do not expose details
    }
  }

  // Something went wrong — back to login
  return NextResponse.redirect(new URL('/?error=auth', origin));
}