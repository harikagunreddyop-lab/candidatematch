/**
 * GET /api/integrations/gmail/auth
 * Initiates Gmail OAuth flow. Redirects to Google consent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getAuthUrl } from '@/lib/gmail-oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/integrations/gmail/callback`;
  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString('base64url');
  const authUrl = getAuthUrl(redirectUri, state);
  return NextResponse.redirect(authUrl);
}
