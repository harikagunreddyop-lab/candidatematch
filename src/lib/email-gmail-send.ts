/**
 * Send email via Gmail API using email_accounts (or gmail_connections fallback).
 * Handles token refresh, tracking pixel injection, and storing in email_messages.
 */

import { createServiceClient } from '@/lib/supabase-server';
import { refreshAccessToken } from '@/lib/gmail-oauth';
import { getAppUrl } from '@/config';
import { randomBytes } from 'crypto';
import { createTrackingSignature } from '@/lib/security';

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface EmailAccountRow {
  id: string;
  user_id: string;
  email_address: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

export interface SendEmailRequest {
  to: string[];
  cc?: string[];
  subject: string;
  body_html: string;
  body_text?: string;
  related_candidate_id?: string | null;
  related_application_id?: string | null;
  tracking_enabled?: boolean;
  schedule_for?: string | null;
}

export interface SendEmailResult {
  messageId: string | null;
  status: 'sent' | 'scheduled' | 'failed';
  error?: string;
}

function base64UrlEncode(raw: string): string {
  return Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateTrackingId(): string {
  return randomBytes(16).toString('hex');
}

export async function getEmailAccountWithValidToken(
  accountId: string
): Promise<{ account: EmailAccountRow; accessToken: string } | null> {
  const supabase = createServiceClient();
  const { data: account, error } = await supabase
    .from('email_accounts')
    .select('id, user_id, email_address, access_token, refresh_token, token_expires_at')
    .eq('id', accountId)
    .eq('is_active', true)
    .single();

  if (error || !account) return null;

  let accessToken = account.access_token;
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  const now = Date.now();
  if (!accessToken || expiresAt < now + 60_000) {
    if (!account.refresh_token) return null;
    const refreshed = await refreshAccessToken(account.refresh_token);
    accessToken = refreshed.access_token;
    const newExpiry = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      : null;
    await supabase
      .from('email_accounts')
      .update({
        access_token: accessToken,
        token_expires_at: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);
  }

  return { account: account as EmailAccountRow, accessToken };
}

/**
 * Fallback: get from gmail_connections by user_id (for backward compat before email_accounts).
 */
export async function getGmailConnectionForUser(userId: string): Promise<{ id: string; email: string; accessToken: string } | null> {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from('gmail_connections')
    .select('id, email, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .single();

  if (!row?.access_token) return null;

  let accessToken = row.access_token;
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (expiresAt < Date.now() + 60_000 && row.refresh_token) {
    const refreshed = await refreshAccessToken(row.refresh_token);
    accessToken = refreshed.access_token;
    await supabase
      .from('gmail_connections')
      .update({
        access_token: accessToken,
        token_expires_at: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : null,
      })
      .eq('id', row.id);
  }

  return { id: row.id, email: row.email, accessToken };
}

export async function sendEmailViaGmail(
  accountId: string,
  request: SendEmailRequest
): Promise<SendEmailResult> {
  const resolved = await getEmailAccountWithValidToken(accountId);
  if (!resolved) return { messageId: null, status: 'failed', error: 'Invalid or expired email account' };

  const { account, accessToken } = resolved;
  const fromEmail = account.email_address;

  let bodyHtml = request.body_html;
  let trackingId: string | null = null;
  if (request.tracking_enabled !== false) {
    trackingId = generateTrackingId();
    const appUrl = getAppUrl();
    const trackingSecret = process.env.EMAIL_TRACKING_SECRET;
    const signature = trackingSecret ? createTrackingSignature([trackingId, 'open'], trackingSecret) : null;
    const trackUrl = appUrl && signature ? `${appUrl}/api/emails/track/${trackingId}?sig=${encodeURIComponent(signature)}` : '';
    if (trackUrl) {
      bodyHtml += `<img src="${trackUrl}" width="1" height="1" alt="" style="display:block;height:1px;width:1px;" />`;
    }
  }

  const lines = [
    `From: ${fromEmail}`,
    `To: ${request.to.join(', ')}`,
    request.cc?.length ? `Cc: ${request.cc.join(', ')}` : null,
    `Subject: ${request.subject.replace(/\r?\n/g, ' ')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    bodyHtml,
  ].filter(Boolean) as string[];

  const rawMessage = lines.join('\r\n');
  const encoded = base64UrlEncode(rawMessage);

  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { messageId: null, status: 'failed', error: err || res.statusText };
  }

  const result = await res.json();
  const messageId = result.id ?? null;

  const supabase = createServiceClient();
  await supabase.from('email_messages').insert({
    email_account_id: accountId,
    message_id: messageId,
    direction: 'outbound',
    from_email: fromEmail,
    to_email: request.to,
    cc_email: request.cc ?? [],
    subject: request.subject,
    body_html: bodyHtml,
    body_text: request.body_text ?? null,
    sent_at: new Date().toISOString(),
    tracking_id: trackingId,
    related_candidate_id: request.related_candidate_id ?? null,
    related_application_id: request.related_application_id ?? null,
  });

  return { messageId, status: 'sent' };
}
