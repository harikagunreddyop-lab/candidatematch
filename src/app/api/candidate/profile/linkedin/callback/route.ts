/**
 * GET /api/candidate/profile/linkedin/callback
 * LinkedIn OAuth callback. Exchanges code, fetches userinfo, updates candidate, sets linkedin_last_synced_at.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceClient } from '@/lib/supabase-server';
import {
  exchangeLinkedInCodeForTokens,
  fetchLinkedInUserInfo,
} from '@/lib/linkedin-oauth';
import { getAppUrl } from '@/config';
import { profileCompletionPercent, profileStrengthScore } from '@/lib/profile-completion';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  const baseUrl = getAppUrl() || req.nextUrl.origin;
  const successRedirect = `${baseUrl}/dashboard/candidate/profile?linkedin=success`;
  const failRedirect = `${baseUrl}/dashboard/candidate/profile?linkedin_error=`;

  let userId: string;
  try {
    const decoded = JSON.parse(
      Buffer.from(state ?? '', 'base64url').toString()
    );
    userId = decoded.userId;
  } catch {
    userId = '';
  }

  if (error || !code || !state || !userId) {
    return NextResponse.redirect(
      `${failRedirect}${error === 'user_cancelled_authorize' ? 'cancelled' : 'auth'}`
    );
  }

  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return NextResponse.redirect(`${failRedirect}session`);
  }

  const redirectUri = `${baseUrl}/api/candidate/profile/linkedin/callback`;
  let accessToken: string;
  try {
    const tokens = await exchangeLinkedInCodeForTokens(code, redirectUri);
    accessToken = tokens.access_token;
  } catch (e) {
    console.error('[linkedin/callback] Token exchange failed', e);
    return NextResponse.redirect(`${failRedirect}exchange`);
  }

  let userInfo;
  try {
    userInfo = await fetchLinkedInUserInfo(accessToken);
  } catch (e) {
    console.error('[linkedin/callback] Userinfo failed', e);
    return NextResponse.redirect(`${failRedirect}fetch`);
  }

  const service = createServiceClient();
  const { data: candidate } = await service
    .from('candidates')
    .select('id, full_name, linkedin_url, experience, education, skills, summary, primary_title, location, target_job_titles')
    .eq('user_id', user.id)
    .single();

  if (!candidate) {
    return NextResponse.redirect(`${failRedirect}no_candidate`);
  }

  const updates: Record<string, unknown> = {
    linkedin_last_synced_at: new Date().toISOString(),
    linkedin_sync_enabled: true,
  };
  if (userInfo.name?.trim()) {
    updates.full_name = userInfo.name.trim();
  }
  const merged = { ...candidate, ...updates };
  (updates as any).profile_completion_percentage = profileCompletionPercent(merged as Record<string, unknown>);
  (updates as any).profile_strength_score = profileStrengthScore(merged as Record<string, unknown>);

  const { error: updateErr } = await service
    .from('candidates')
    .update(updates)
    .eq('id', candidate.id);

  if (updateErr) {
    console.error('[linkedin/callback] Update failed', updateErr);
    return NextResponse.redirect(`${failRedirect}save`);
  }

  return NextResponse.redirect(successRedirect);
}
