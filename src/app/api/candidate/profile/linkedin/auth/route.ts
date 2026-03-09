/**
 * GET /api/candidate/profile/linkedin/auth
 * Starts LinkedIn OAuth. Redirects to LinkedIn consent; callback will import profile and set linkedin_last_synced_at.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceClient } from '@/lib/supabase-server';
import { getLinkedInAuthUrl } from '@/lib/linkedin-oauth';
import { getAppUrl } from '@/config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  const service = createServiceClient();
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'candidate') {
    return NextResponse.json({ error: 'LinkedIn import is for candidates only' }, { status: 403 });
  }

  const baseUrl = getAppUrl() || req.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/candidate/profile/linkedin/callback`;
  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString('base64url');
  try {
    const authUrl = getLinkedInAuthUrl(redirectUri, state);
    return NextResponse.redirect(authUrl);
  } catch (e) {
    console.error('[linkedin/auth]', e);
    return NextResponse.redirect(
      `${baseUrl}/dashboard/candidate/profile?linkedin_error=config`
    );
  }
}
