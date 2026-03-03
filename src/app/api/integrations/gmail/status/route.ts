/**
 * GET /api/integrations/gmail/status
 * Returns Gmail connection status for the current user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { roles: ['admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('gmail_connections')
    .select('id, email, connected_at, last_sync_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    connected: !!data,
    email: data?.email ?? null,
    connected_at: data?.connected_at ?? null,
    last_sync_at: data?.last_sync_at ?? null,
  });
}
