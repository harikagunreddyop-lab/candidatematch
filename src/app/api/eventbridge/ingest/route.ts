/**
 * POST /api/eventbridge/ingest
 * EventBridge target for hourly ingest. Forwards to cron ingest logic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/security';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!validateCronAuth(req)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
  const base = appUrl.startsWith('http') ? appUrl : `https://${appUrl}`;
  const cronSecret = process.env.CRON_SECRET || '';
  const res = await fetch(`${base}/api/cron/ingest`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }
  return NextResponse.json(data);
}
