// src/app/api/invite/route.ts
// Server-side invite — uses SUPABASE_SERVICE_ROLE_KEY so admin API is available
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { email?: string; role?: string; name?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { email, role, name, phone } = body ?? {};

  if (!email || !role) {
    return NextResponse.json({ error: 'email and role are required' }, { status: 400 });
  }
  if (!['candidate', 'recruiter', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify caller is admin
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (callerProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can send invites' }, { status: 403 });
  }

  const displayName = name || email.split('@')[0];

  // Base URL for invite links: prefer env, then derive from request (e.g. Host header in deployment)
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
  const fromRequest = host ? `${proto}://${host}` : '';
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || fromRequest).replace(/\/$/, '');
  if (!baseUrl) {
    return NextResponse.json({
      error: 'Set NEXT_PUBLIC_APP_URL in .env or deployment (e.g. https://your-app.com) so invite links work.',
    }, { status: 500 });
  }
  // All invited users (candidate, recruiter, admin) must set password first — send them to set-password page
  const redirectTo = `${baseUrl}/auth/reset-password`;

  // Send invite (user receives email; link must go to set-password — add this URL in Supabase Auth > URL Configuration > Redirect URLs)
  const { data: inviteData, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { role, name: displayName, phone: phone?.trim() || null },
  });

  if (error) {
    if (error.message?.includes('already been registered')) {
      return NextResponse.json({ error: 'This email is already registered in the system.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Do NOT create candidate here. Password creation = acceptance.
  // Profile is created by DB trigger; upsert to add phone and ensure data.
  if (inviteData?.user?.id) {
    await adminClient.from('profiles').upsert({
      id: inviteData.user.id,
      email,
      name: displayName,
      phone: phone?.trim() || null,
      role,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  return NextResponse.json({ success: true, email, role });
}