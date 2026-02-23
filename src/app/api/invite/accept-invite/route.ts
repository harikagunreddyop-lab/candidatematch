// Accept invite: create/link candidate and set invite_accepted_at when user sets password.
// Called from reset-password page after successful updateUser.
// Password creation = acceptance of the invitation.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, email, name, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'candidate') {
    return NextResponse.json({ success: true }); // Not a candidate, nothing to do
  }

  const now = new Date().toISOString();
  const displayName = profile.name || user.email?.split('@')[0] || '';

  // Check if candidate row exists (e.g. linked by trigger from orphan)
  const { data: existing } = await adminClient
    .from('candidates')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    await adminClient
      .from('candidates')
      .update({ invite_accepted_at: now, updated_at: now })
      .eq('id', existing.id);
    return NextResponse.json({ success: true });
  }

  // No candidate row — create one (or link orphan by email)
  const { data: orphan } = await adminClient
    .from('candidates')
    .select('id')
    .eq('email', profile.email || user.email)
    .is('user_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const meta = user.user_metadata || {};
  const phone = meta.phone ?? null;

  if (orphan) {
    await adminClient
      .from('candidates')
      .update({
        user_id: user.id,
        invite_accepted_at: now,
        onboarding_completed: true,
        updated_at: now,
      })
      .eq('id', orphan.id);
  } else {
    await adminClient.from('candidates').insert({
      user_id: user.id,
      email: profile.email || user.email,
      full_name: displayName,
      phone,
      primary_title: '',
      skills: [],
      secondary_titles: [],
      active: true,
      onboarding_completed: true,
      invite_accepted_at: now,
      created_at: now,
      updated_at: now,
    });
  }

  return NextResponse.json({ success: true });
}
