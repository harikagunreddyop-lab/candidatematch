/**
 * Process scheduled_emails: send due emails via Gmail.
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Run every 1–5 minutes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { sendEmailViaGmail, getEmailAccountWithValidToken } from '@/lib/email-gmail-send';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET || '';
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data: due, error: fetchErr } = await supabase
    .from('scheduled_emails')
    .select('id, email_account_id, to_email, cc_email, subject, body_html, body_text, related_candidate_id, related_application_id, tracking_enabled')
    .eq('status', 'pending')
    .lte('send_at', now)
    .limit(50);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!due || due.length === 0) return NextResponse.json({ processed: 0 });

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const canSend = await getEmailAccountWithValidToken(row.email_account_id);
    if (!canSend) {
      await supabase
        .from('scheduled_emails')
        .update({ status: 'failed', error_message: 'Invalid or expired email account' })
        .eq('id', row.id);
      failed++;
      continue;
    }

    const result = await sendEmailViaGmail(row.email_account_id, {
      to: row.to_email,
      cc: row.cc_email?.length ? row.cc_email : undefined,
      subject: row.subject,
      body_html: row.body_html,
      body_text: row.body_text ?? undefined,
      related_candidate_id: row.related_candidate_id ?? null,
      related_application_id: row.related_application_id ?? null,
      tracking_enabled: row.tracking_enabled !== false,
    });

    if (result.status === 'sent') {
      await supabase
        .from('scheduled_emails')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', row.id);
      sent++;
    } else {
      await supabase
        .from('scheduled_emails')
        .update({ status: 'failed', error_message: result.error || 'Send failed' })
        .eq('id', row.id);
      failed++;
    }
  }

  return NextResponse.json({ processed: due.length, sent, failed });
}
