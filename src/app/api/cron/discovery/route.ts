/**
 * GET /api/cron/discovery
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTENDED CALLER: AWS EventBridge Scheduler (e.g. daily).
 * Runs company auto-discovery from the companies table to detect job boards
 * and create ingest_connectors.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { structuredLog } from '@/lib/logger';
import { validateCronAuth } from '@/lib/security';
import { runDiscovery } from '@/discovery/discover';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const callerIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';

  structuredLog('info', 'cron discovery called', {
    caller_ip: callerIp,
    started_at: new Date().toISOString(),
  });

  if (!validateCronAuth(req)) {
    structuredLog('warn', 'cron discovery unauthorized', { caller_ip: callerIp });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const summary = await runDiscovery({
      useCompaniesTable: true,
      limit: 500,
    });

    const elapsed = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      ...summary,
      elapsed_ms: elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    structuredLog('error', 'cron discovery failed', { error: String(error) });
    return NextResponse.json(
      { error: 'Discovery failed', details: String(error) },
      { status: 500 }
    );
  }
}
