/**
 * Gmail OAuth flow — wrapper around gmail-oauth helpers.
 * Use for both recruiter and candidate Gmail connections.
 */

import {
  getAuthUrl as getAuthUrlBase,
  exchangeCodeForTokens,
  type GmailTokens,
} from '@/lib/gmail-oauth';

export type { GmailTokens };

export class GmailAuth {
  private redirectUri: string;

  constructor(redirectUri: string) {
    this.redirectUri = redirectUri;
  }

  /** Returns Google consent URL. state should be base64url-encoded JSON e.g. { userId, for: 'candidate' }. */
  getAuthUrl(state: string): string {
    return getAuthUrlBase(this.redirectUri, state);
  }

  /** Exchange authorization code for tokens. */
  async handleCallback(code: string): Promise<GmailTokens> {
    return exchangeCodeForTokens(code, this.redirectUri);
  }
}
