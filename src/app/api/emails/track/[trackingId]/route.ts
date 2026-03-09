/**
 * GET /api/emails/track/[trackingId]
 * Tracking pixel for email opens. Records opened_at and returns 1x1 transparent GIF.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyTrackingSignature } from '@/lib/security';

export const dynamic = 'force-dynamic';

const TRACKING_PIXEL_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  const { trackingId } = await params;
  const signature = req.nextUrl.searchParams.get('sig');
  const trackingSecret = process.env.EMAIL_TRACKING_SECRET;
  if (!trackingId) {
    return new NextResponse(null, { status: 404 });
  }
  if (!trackingSecret) {
    return new NextResponse(null, { status: 503 });
  }
  if (!verifyTrackingSignature([trackingId, 'open'], signature, trackingSecret)) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from('email_messages')
    .select('id, opened_at')
    .eq('tracking_id', trackingId)
    .single();

  if (row && !row.opened_at) {
    await supabase
      .from('email_messages')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', row.id);
  }

  const buffer = Buffer.from(TRACKING_PIXEL_BASE64, 'base64');
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Content-Length': String(buffer.length),
    },
  });
}
