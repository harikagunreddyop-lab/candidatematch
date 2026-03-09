/**
 * GET /api/emails/click/[trackingId]/[linkKey]
 * Track link click then redirect to original URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyTrackingSignature } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ trackingId: string; linkKey: string }> }
) {
  const { trackingId, linkKey } = await params;
  const signature = req.nextUrl.searchParams.get('sig');
  const trackingSecret = process.env.EMAIL_TRACKING_SECRET;
  if (!trackingId || !linkKey) {
    return NextResponse.redirect(new URL('https://example.com'), 302);
  }
  if (!trackingSecret) {
    return NextResponse.redirect(new URL('https://example.com'), 302);
  }

  const supabase = createServiceClient();
  const { data: msg } = await supabase
    .from('email_messages')
    .select('id')
    .eq('tracking_id', trackingId)
    .single();

  let redirectUrl = 'https://example.com';
  const decodedKey = decodeURIComponent(linkKey);
  const isValidSignature = verifyTrackingSignature([trackingId, decodedKey, 'click'], signature, trackingSecret);

  if (msg?.id && isValidSignature) {
    const { data: linkRow } = await supabase
      .from('email_tracking_links')
      .select('id, original_url')
      .eq('message_id', msg.id)
      .eq('link_key', decodedKey)
      .single();

    if (linkRow) {
      redirectUrl = linkRow.original_url || redirectUrl;
      await supabase
        .from('email_tracking_links')
        .update({ clicked_at: new Date().toISOString() })
        .eq('id', linkRow.id);

      await supabase
        .from('email_messages')
        .update({ clicked_at: new Date().toISOString() })
        .eq('id', msg.id)
        .is('clicked_at', null);
    }
  }

  try {
    new URL(redirectUrl);
  } catch {
    redirectUrl = 'https://example.com';
  }

  return NextResponse.redirect(redirectUrl, 302);
}
