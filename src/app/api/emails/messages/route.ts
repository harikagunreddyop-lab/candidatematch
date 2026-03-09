/**
 * GET /api/emails/messages — List sent/received messages for the authenticated user's email account(s).
 * Query: account_id?, direction?, limit?, offset?
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;

  const { searchParams } = req.nextUrl;
  const accountId = searchParams.get('account_id') ?? undefined;
  const direction = searchParams.get('direction') ?? undefined;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));

  const supabase = createServiceClient();
  let accountIds: string[];

  if (accountId) {
    const { data: acc } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', auth.user.id)
      .single();
    if (!acc) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    accountIds = [acc.id];
  } else {
    const { data: accounts } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('is_active', true);
    accountIds = (accounts ?? []).map((a: { id: string }) => a.id);
  }

  if (accountIds.length === 0) {
    return NextResponse.json({ messages: [], total: 0 });
  }

  let query = supabase
    .from('email_messages')
    .select('id, message_id, thread_id, direction, from_email, to_email, subject, sent_at, opened_at, clicked_at, related_candidate_id, related_application_id, created_at', { count: 'exact' })
    .in('email_account_id', accountIds)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (direction === 'inbound' || direction === 'outbound') {
    query = query.eq('direction', direction);
  }

  const { data: messages, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: messages ?? [], total: count ?? 0 });
}
