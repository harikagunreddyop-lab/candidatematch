/**
 * POST: create connector
 * GET: list connectors
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
const VALID_PROVIDERS = ['greenhouse', 'lever', 'ashby'] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('ingest_connectors')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ connectors: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { provider?: string; source_org?: string; sync_interval_min?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const provider = body.provider?.toLowerCase?.();
  const source_org = typeof body.source_org === 'string' ? body.source_org.trim() : '';
  const sync_interval_min = typeof body.sync_interval_min === 'number'
    ? Math.max(15, Math.min(1440, body.sync_interval_min))
    : 60;

  if (!provider || !(VALID_PROVIDERS as readonly string[]).includes(provider)) {
    return NextResponse.json(
      { error: 'provider must be greenhouse, lever, or ashby' },
      { status: 400 }
    );
  }
  if (!source_org) {
    return NextResponse.json({ error: 'source_org is required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('ingest_connectors')
    .insert({
      provider,
      source_org,
      sync_interval_min,
      is_enabled: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
