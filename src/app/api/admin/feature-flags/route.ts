import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import {
  listFeatureFlagKeys,
  getFeatureFlag,
  setFeatureFlag,
  initializeFeatureFlags,
  type FeatureFlag,
} from '@/lib/feature-flags';
import { handleAPIError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/** GET — List all product feature flags (Redis). Admin only. Seeds defaults on first use if empty. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let keys = await listFeatureFlagKeys();
  if (keys.length === 0) {
    await initializeFeatureFlags();
    keys = await listFeatureFlagKeys();
  }
  const flags: FeatureFlag[] = [];
  for (const key of keys) {
    const flag = await getFeatureFlag(key);
    if (flag) flags.push(flag);
  }
  return NextResponse.json(flags);
}

/** PATCH — Toggle or update a feature flag. Admin only. Body: { key, action?: 'toggle', enabled?: boolean }. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
  const body = await req.json().catch(() => ({}));
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) {
    return NextResponse.json({ error: 'key required' }, { status: 400 });
  }

  const flag = await getFeatureFlag(key);
  if (!flag) {
    return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
  }

  if (body.action === 'toggle') {
    flag.enabled = !flag.enabled;
  } else if (typeof body.enabled === 'boolean') {
    flag.enabled = body.enabled;
  }

  await setFeatureFlag(flag);
  return NextResponse.json(flag);
  } catch (e) {
    return handleAPIError(e);
  }
}
