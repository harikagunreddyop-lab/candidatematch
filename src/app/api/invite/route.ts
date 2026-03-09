// src/app/api/invite/route.ts
// Server-side invite — uses SUPABASE_SERVICE_ROLE_KEY so admin API is available
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimitResponse } from '@/lib/rate-limit';
import { inviteSchema } from '@/lib/validation/schemas';
import { parseBody } from '@/lib/validation/parse';
import { getAppUrl } from '@/config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseBody(body, inviteSchema);
  if ('error' in parsed) return parsed.error;
  const { email, role, name, phone } = parsed.data;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify caller is admin
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimitResponse(req, 'api', user.id);
  if (rl) return rl;

  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role, effective_role, company_id')
    .eq('id', user.id)
    .single();

  const callerEffectiveRole = callerProfile?.effective_role || callerProfile?.role;
  if (!['admin', 'platform_admin', 'company_admin'].includes(callerEffectiveRole as string)) {
    return NextResponse.json({ error: 'Only admins or company admins can send invites' }, { status: 403 });
  }

  const displayName = name || email.split('@')[0];

  // Base URL for invite links: prefer config (NEXT_PUBLIC_APP_URL / SITE_URL / VERCEL_URL), then derive from request
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
  const fromRequest = host ? `${proto}://${host}` : '';
  const baseUrl = (getAppUrl() || fromRequest).replace(/\/$/, '');
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

    // If inviting a company staff member, link them to the caller's company
    if (['recruiter', 'company_admin'].includes(role)) {
      const { data: callerFull } = await adminClient
        .from('profiles').select('company_id, effective_role').eq('id', user.id).single();

      if (callerFull?.company_id) {
        await adminClient.from('profiles').update({
          company_id: callerFull.company_id,
          effective_role: role === 'company_admin' ? 'company_admin' : 'recruiter',
        }).eq('id', inviteData.user.id);
      }
    }
  }

  return NextResponse.json({ success: true, email, role });
}