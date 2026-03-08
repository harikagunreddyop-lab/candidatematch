/**
 * GET /api/integrations/gmail/callback
 * OAuth callback from Google. Exchanges code for tokens and stores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceClient } from '@/lib/supabase-server';
import { exchangeCodeForTokens } from '@/lib/gmail-oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  let userId: string;
  let forCandidate = false;
  try {
    const stateStr = state ?? '';
    const decoded = JSON.parse(Buffer.from(stateStr, 'base64url').toString());
    userId = decoded.userId;
    forCandidate = decoded.for === 'candidate';
  } catch {
    userId = '';
  }

  const successRedirect = forCandidate
    ? `${baseUrl}/dashboard/candidate/integrations`
    : `${baseUrl}/dashboard/recruiter/integrations`;
  const failRedirect = forCandidate
    ? `${baseUrl}/dashboard/candidate/integrations?error=gmail`
    : `${baseUrl}/dashboard/recruiter/integrations?error=gmail`;

  if (error) {
    return NextResponse.redirect(failRedirect);
  }
  if (!code || !state) {
    return NextResponse.redirect(failRedirect);
  }

  if (!userId) {
    return NextResponse.redirect(failRedirect);
  }

  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return NextResponse.redirect(failRedirect);
  }

  const redirectUri = `${baseUrl}/api/integrations/gmail/callback`;
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, redirectUri);
  } catch (e) {
    console.error('[gmail/callback] Token exchange failed', e);
    return NextResponse.redirect(failRedirect);
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const service = createServiceClient();
  const { error: upsertErr } = await service.from('gmail_connections').upsert(
    {
      user_id: user.id,
      email: user.email || 'unknown',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: expiresAt,
      scope: tokens.scope || null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (upsertErr) {
    console.error('[gmail/callback] Upsert failed', upsertErr);
    return NextResponse.redirect(failRedirect);
  }

  return NextResponse.redirect(successRedirect);
}
