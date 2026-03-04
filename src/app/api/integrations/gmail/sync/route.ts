/**
 * POST /api/integrations/gmail/sync
 * Syncs recent Gmail messages and matches to candidates/applications.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceClient } from '@/lib/supabase-server';
import { refreshAccessToken } from '@/lib/gmail-oauth';
import { fetchRecentMessages, parseGmailMessage } from '@/lib/gmail-sync';

export const dynamic = 'force-dynamic';

/**
 * Infer application status from email subject/snippet keywords.
 * Returns null if no clear signal is detected (to avoid false updates).
 */
function inferStatusFromEmail(subject: string, snippet: string): string | null {
  const text = `${subject} ${snippet}`.toLowerCase();

  const rejectionPatterns = [
    /unfortunately.*not.*mov(e|ing) forward/,
    /decided not to proceed/,
    /after careful (review|consideration).*not/,
    /position has been filled/,
    /we('ve| have) decided to (go|move) (with|forward with) (another|other) candidate/,
    /regret to inform/,
    /not selected/,
    /will not be (moving|proceeding)/,
  ];
  if (rejectionPatterns.some(p => p.test(text))) return 'rejected';

  const offerPatterns = [
    /pleased to (offer|extend)/,
    /offer (letter|of employment)/,
    /we('d| would) like to offer you/,
    /congratulations.*offer/,
    /formal offer/,
  ];
  if (offerPatterns.some(p => p.test(text))) return 'offer';

  const interviewPatterns = [
    /schedule.*(interview|call|chat)/,
    /interview (invitation|scheduled|confirmation)/,
    /like to (invite|schedule) you for (an |a )?(interview|call)/,
    /next (round|step|stage).*interview/,
    /technical (assessment|interview|screen)/,
  ];
  if (interviewPatterns.some(p => p.test(text))) return 'interview_scheduled';

  const screenPatterns = [
    /phone screen/,
    /initial (call|screen|chat)/,
    /recruiter (call|screen|chat)/,
    /introductory call/,
  ];
  if (screenPatterns.some(p => p.test(text))) return 'screening';

  return null;
}

async function getValidAccessToken(conn: { access_token: string; refresh_token: string | null; token_expires_at: string | null }) {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60_000) {
    return conn.access_token;
  }
  if (!conn.refresh_token) {
    throw new Error('Refresh token missing');
  }
  const refreshed = await refreshAccessToken(conn.refresh_token);
  return refreshed.access_token;
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: conn, error: connErr } = await service
    .from('gmail_connections')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('user_id', user.id)
    .single();

  if (connErr || !conn) {
    return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(conn);
  } catch (e) {
    return NextResponse.json({ error: 'Token expired. Please reconnect Gmail.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const maxResults = Math.min(Math.max(Number(body.maxResults) || 50, 10), 100);
  const afterTs = body.afterTimestamp ? Number(body.afterTimestamp) : undefined;

  let messages;
  try {
    messages = await fetchRecentMessages(accessToken, maxResults, afterTs);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Gmail API error' }, { status: 502 });
  }

  // Get recruiter's assigned candidate emails
  const { data: assignments } = await service
    .from('recruiter_candidate_assignments')
    .select('candidate_id')
    .eq('recruiter_id', user.id);
  const candidateIds = (assignments || []).map((a: any) => a.candidate_id);

  const { data: candidates } = candidateIds.length > 0
    ? await service.from('candidates').select('id, email').in('id', candidateIds)
    : { data: [] };
  const emailToCandidate = new Map<string, string>();
  for (const c of candidates || []) {
    const email = (c.email || '').toLowerCase().trim();
    if (email) emailToCandidate.set(email, c.id);
  }

  const rows: Array<{
    connection_id: string;
    gmail_message_id: string;
    gmail_thread_id: string;
    from_email: string;
    to_emails: string[];
    subject: string;
    snippet: string;
    received_at: string;
    candidate_id: string | null;
    application_id: string | null;
  }> = [];

  for (const msg of messages) {
    const parsed = parseGmailMessage(msg);
    const candidateId = emailToCandidate.get(parsed.from_email) || null;
    let applicationId: string | null = null;
    if (candidateId) {
      const { data: app } = await service
        .from('applications')
        .select('id')
        .eq('candidate_id', candidateId)
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      applicationId = app?.id ?? null;
    }
    rows.push({
      connection_id: conn.id,
      gmail_message_id: parsed.gmail_message_id,
      gmail_thread_id: parsed.gmail_thread_id,
      from_email: parsed.from_email,
      to_emails: parsed.to_emails,
      subject: parsed.subject,
      snippet: parsed.snippet,
      received_at: parsed.received_at,
      candidate_id: candidateId,
      application_id: applicationId,
    });
  }

  if (rows.length > 0) {
    await service.from('email_activity').upsert(rows, {
      onConflict: 'connection_id,gmail_message_id',
      ignoreDuplicates: true,
    });
  }

  // Auto-update application status based on email subject/snippet signals
  let statusUpdates = 0;
  for (const row of rows) {
    if (!row.application_id) continue;
    const inferred = inferStatusFromEmail(row.subject, row.snippet);
    if (!inferred) continue;
    const { error: upErr } = await service
      .from('applications')
      .update({ status: inferred, updated_at: new Date().toISOString() })
      .eq('id', row.application_id);
    if (!upErr) statusUpdates++;
  }

  await service
    .from('gmail_connections')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', conn.id);

  return NextResponse.json({
    synced: rows.length,
    matched: rows.filter(r => r.candidate_id).length,
    status_updates: statusUpdates,
  });
}
