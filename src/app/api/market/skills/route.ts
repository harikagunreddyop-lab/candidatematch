import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();

  const { searchParams } = new URL(req.url);
  const skill = searchParams.get('skill');
  const region = searchParams.get('region');

  let q = supabase
    .from('market_skill_trends')
    .select('skill, demand_score, salary_min, salary_max, growth_rate, region, as_of')
    .order('as_of', { ascending: false })
    .limit(50);

  if (skill) q = q.eq('skill', skill);
  if (region) q = q.eq('region', region);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ results: data || [] });
}

