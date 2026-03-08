/**
 * POST /api/cron/gmail-candidate-sync
 * Runs Gmail job-application tracking for all candidates who have connected Gmail.
 * Intended caller: EventBridge or cron every 6 hours.
 * Auth: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase-server';
import { JobTracker } from '@/lib/gmail/job-tracker';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!validateCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync();
}

export async function GET(req: NextRequest) {
  if (!validateCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync();
}

async function runSync() {
  const service = createServiceClient();
  const { data: connections } = await service
    .from('gmail_connections')
    .select('id, user_id, access_token, refresh_token, token_expires_at');

  if (!connections?.length) {
    return NextResponse.json({ ok: true, candidatesProcessed: 0, totalUpdates: 0 });
  }

  const tracker = new JobTracker();
  let candidatesProcessed = 0;
  let totalUpdates = 0;

  for (const conn of connections) {
    const { data: candidate } = await service
      .from('candidates')
      .select('id')
      .eq('user_id', conn.user_id)
      .single();

    if (!candidate) continue;

    try {
      const result = await tracker.trackApplications(candidate.id, {
        id: conn.id,
        user_id: conn.user_id,
        access_token: conn.access_token,
        refresh_token: conn.refresh_token,
        token_expires_at: conn.token_expires_at,
      });
      candidatesProcessed++;
      totalUpdates += result.autoUpdates;
    } catch {
      // skip this candidate and continue
    }
  }

  return NextResponse.json({
    ok: true,
    candidatesProcessed,
    totalUpdates,
    connectionsChecked: connections.length,
  });
}
