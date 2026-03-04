/**
 * POST: trigger manual sync for a connector
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { isValidUuid } from '@/lib/security';
import { syncConnector } from '@/ingest/sync';

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id || !isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid connector id' }, { status: 400 });
  }

  try {
    const result = await syncConnector(id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
