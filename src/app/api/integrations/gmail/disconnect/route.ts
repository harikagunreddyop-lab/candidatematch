/**
 * DELETE /api/integrations/gmail/disconnect
 * Removes Gmail connection for the current user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('gmail_connections')
    .delete()
    .eq('user_id', auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
