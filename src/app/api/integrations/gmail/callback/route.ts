/**
 * GET /api/integrations/gmail/callback
 * OAuth callback from Google. Exchanges code for tokens and stores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceClient } from '@/lib/supabase-server';
import { exchangeCodeForTokens, getGmailProfile } from '@/lib/gmail-oauth';
import { getAppUrl } from '@/config';
import { apiLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  const baseUrl = getAppUrl() || req.nextUrl.origin;

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
    apiLogger.error({ err: e }, '[gmail/callback] token exchange failed');
    return NextResponse.redirect(failRedirect);
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  let emailAddress = user.email || 'unknown';
  try {
    const profile = await getGmailProfile(tokens.access_token);
    emailAddress = profile.emailAddress;
  } catch {
    // keep user.email fallback
  }

  const service = createServiceClient();

  await service.from('gmail_connections').upsert(
    {
      user_id: user.id,
      email: emailAddress,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: expiresAt,
      scope: tokens.scope || null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  const { error: emailAccErr } = await service.from('email_accounts').upsert(
    {
      user_id: user.id,
      email_address: emailAddress,
      provider: 'gmail',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: expiresAt,
      is_primary: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,email_address' }
  );
  if (emailAccErr) {
    // email_accounts table may not exist yet (migration 064); continue
  }

  return NextResponse.redirect(successRedirect);
}
