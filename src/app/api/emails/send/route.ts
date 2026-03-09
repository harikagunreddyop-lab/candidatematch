/**
 * POST /api/emails/send
 * Send email via Gmail (email_account_id or use primary account for user).
 * Body: { email_account_id?, to, cc?, subject, body_html, body_text?, related_candidate_id?, related_application_id?, tracking_enabled? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { sendEmailViaGmail, getEmailAccountWithValidToken } from '@/lib/email-gmail-send';
import { parseBody } from '@/lib/validation/parse';
import { emailSendSchema } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;

  const rawBody = await req.json().catch(() => null);
  if (!rawBody || typeof rawBody !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsedBody = parseBody(rawBody, emailSendSchema);
  if ('error' in parsedBody) return parsedBody.error;
  const body = parsedBody.data;

  const supabase = createServiceClient();
  let accountId: string | null = body.email_account_id ?? null;

  if (!accountId) {
    const { data: account } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('is_primary', true)
      .eq('is_active', true)
      .limit(1)
      .single();
    accountId = account?.id ?? null;
  }

  if (!accountId) {
    return NextResponse.json({
      error: 'No email account selected. Connect Gmail in integrations and set as primary, or pass email_account_id.',
    }, { status: 400 });
  }

  const canAccess = await getEmailAccountWithValidToken(accountId);
  if (!canAccess || canAccess.account.user_id !== auth.user.id) {
    return NextResponse.json({ error: 'Email account not found or access denied' }, { status: 403 });
  }

  const result = await sendEmailViaGmail(accountId, {
    to: body.to,
    cc: body.cc,
    subject: body.subject,
    body_html: body.body_html,
    body_text: body.body_text,
    related_candidate_id: body.related_candidate_id ?? null,
    related_application_id: body.related_application_id ?? null,
    tracking_enabled: body.tracking_enabled !== false,
  });

  if (result.status === 'failed') {
    return NextResponse.json({ error: result.error || 'Send failed' }, { status: 500 });
  }

  return NextResponse.json({
    message_id: result.messageId,
    status: result.status,
  });
}
