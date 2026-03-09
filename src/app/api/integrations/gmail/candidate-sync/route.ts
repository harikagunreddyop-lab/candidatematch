/**
 * POST /api/integrations/gmail/candidate-sync
 * Runs Gmail job-application tracking for the current candidate: parse emails, update application status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { JobTracker } from '@/lib/gmail/job-tracker';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const service = createServiceClient();
  const { data: candidate } = await service
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });
  }

  const { data: conn, error: connErr } = await service
    .from('gmail_connections')
    .select('id, user_id, access_token, refresh_token, token_expires_at')
    .eq('user_id', auth.user.id)
    .single();

  if (connErr || !conn) {
    return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });
  }

  try {
    const tracker = new JobTracker();
    const result = await tracker.trackApplications(candidate.id, {
      id: conn.id,
      user_id: conn.user_id,
      access_token: conn.access_token,
      refresh_token: conn.refresh_token,
      token_expires_at: conn.token_expires_at,
    });

    await service
      .from('gmail_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', conn.id);

    return NextResponse.json({
      success: true,
      emailsScanned: result.emailsScanned,
      jobsDetected: result.jobsDetected,
      autoUpdates: result.autoUpdates,
      detections: result.detections,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message || 'Sync failed' }, { status: 502 });
  }
}
