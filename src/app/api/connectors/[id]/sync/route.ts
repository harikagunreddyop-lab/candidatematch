/**
 * POST: trigger manual sync for a connector
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { isValidUuid } from '@/lib/security';
import { syncConnector } from '@/ingest/sync';
import { createServiceClient } from '@/lib/supabase-server';
import { logAuditServer } from '@/lib/audit';
import { apiLogger } from '@/lib/logger';

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id || !isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid connector id' }, { status: 400 });
  }

  try {
    const result = await syncConnector(id);
    const supabase = createServiceClient();
    try {
      await logAuditServer(supabase as never, {
        actor_id: auth.user.id,
        actor_role: auth.profile.effective_role,
      }, {
        action: 'connector.sync',
        resourceType: 'ingest_connectors',
        resourceId: id,
        details: {
          mode: 'single',
          provider: result.provider,
          source_org: result.sourceOrg,
          fetched: result.fetched,
          promoted: result.promoted,
        },
      });
    } catch {
      // Keep sync result successful even if audit write fails.
    }
    apiLogger.info({
      route: '/api/connectors/[id]/sync',
      user_id: auth.user.id,
      connector_id: id,
      duration_ms: Date.now() - startedAt,
    }, 'connector sync completed');
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    apiLogger.error({ route: '/api/connectors/[id]/sync', user_id: auth.user.id, connector_id: id, err: message }, 'connector sync failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
