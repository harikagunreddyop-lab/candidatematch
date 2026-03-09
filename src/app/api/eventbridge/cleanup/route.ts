/**
 * POST /api/eventbridge/cleanup
 * EventBridge target for daily cleanup.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/security';
import { getAppUrl } from '@/config';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!validateCronAuth(req)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const appUrl = getAppUrl();
  const base = appUrl.startsWith('http') ? appUrl : appUrl ? `https://${appUrl}` : '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (!base) {
    return NextResponse.json({ error: 'App URL not configured (set NEXT_PUBLIC_APP_URL or VERCEL_URL)' }, { status: 500 });
  }
  const res = await fetch(`${base}/api/cron/cleanup`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }
  return NextResponse.json(data);
}
