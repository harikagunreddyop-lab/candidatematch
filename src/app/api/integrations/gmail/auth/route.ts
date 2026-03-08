/**
 * GET /api/integrations/gmail/auth
 * Initiates Gmail OAuth flow. Redirects to Google consent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceClient } from '@/lib/supabase-server';
import { getAuthUrl } from '@/lib/gmail-oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  const forCandidate = req.nextUrl.searchParams.get('for') === 'candidate';

  if (forCandidate) {
    const service = createServiceClient();
    const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'candidate') {
      return NextResponse.json({ error: 'Gmail integration for candidates only' }, { status: 403 });
    }
  } else {
    const service = createServiceClient();
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || !['admin', 'recruiter'].includes(profile.role)) {
      return NextResponse.json({ error: 'Gmail integration is available for recruiters and admins only' }, { status: 403 });
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/integrations/gmail/callback`;
  const state = Buffer.from(JSON.stringify({ userId: user.id, for: forCandidate ? 'candidate' : 'recruiter' })).toString('base64url');
  const authUrl = getAuthUrl(redirectUri, state);
  return NextResponse.redirect(authUrl);
}
