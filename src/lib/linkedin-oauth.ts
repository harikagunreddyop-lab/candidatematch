/**
 * LinkedIn OAuth 2.0 + OpenID Connect — auth URL, token exchange, and userinfo.
 * Uses Sign In with LinkedIn (openid, profile, email). No token storage; one-time import on callback.
 */

import { config } from '@/config';

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

const SCOPES = ['openid', 'profile', 'email'].join(' ');

export interface LinkedInTokens {
  access_token: string;
  expires_in?: number;
  scope?: string;
}

export interface LinkedInUserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
}

export function getLinkedInAuthUrl(redirectUri: string, state: string): string {
  const clientId = config.LINKEDIN_CLIENT_ID;
  if (!clientId) throw new Error('LINKEDIN_CLIENT_ID not configured');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

export async function exchangeLinkedInCodeForTokens(
  code: string,
  redirectUri: string
): Promise<LinkedInTokens> {
  const clientId = config.LINKEDIN_CLIENT_ID;
  const clientSecret = config.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('LinkedIn OAuth not configured');

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn token exchange failed: ${res.status} ${err}`);
  }
  return res.json();
}

export async function fetchLinkedInUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  const res = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn userinfo failed: ${res.status} ${err}`);
  }
  return res.json();
}
