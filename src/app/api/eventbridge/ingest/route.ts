/**
 * POST /api/eventbridge/ingest
 * EventBridge target for hourly ingest. Forwards to cron ingest logic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/security';
import { getAppUrl } from '@/config';

export const maxDuration = 300;

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
  const res = await fetch(`${base}/api/cron/ingest`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  // Best effort: run saved-search alerts after ingest so newly ingested jobs can notify candidates quickly.
  const alertsRes = await fetch(`${base}/api/cron/saved-search-alerts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const alertsData = await alertsRes.json().catch(() => ({}));

  return NextResponse.json({
    ...data,
    saved_search_alerts: alertsRes.ok
      ? { ok: true, ...(alertsData ?? {}) }
      : { ok: false, status: alertsRes.status, ...(alertsData ?? {}) },
  });
}
