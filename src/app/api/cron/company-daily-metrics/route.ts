/**
 * POST /api/cron/company-daily-metrics
 * Call from cron (e.g. daily) to run update_company_daily_metrics for all companies.
 * Secure with CRON_SECRET or similar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { validateCronAuth } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  if (!validateCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: companies } = await supabase.from('companies').select('id').eq('is_active', true);
  const companyIds = (companies ?? []).map((c: { id: string }) => c.id);
  const today = new Date().toISOString().slice(0, 10);

  for (const companyId of companyIds) {
    await supabase.rpc('update_company_daily_metrics', {
      p_company_id: companyId,
      p_date: today,
    });
  }

  return NextResponse.json({
    ok: true,
    updated: companyIds.length,
    date: today,
  });
}
