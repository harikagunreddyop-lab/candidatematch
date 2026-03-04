import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);

  const skill = searchParams.get('skill');
  const region = searchParams.get('region');

  let q = supabase
    .from('jobs')
    .select('id, title, company, location, job_metadata')
    .eq('is_active', true)
    .limit(100);

  if (skill) {
    q = q.contains('job_metadata', { skills: [skill] });
  }
  if (region) {
    q = q.eq('location', region);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ results: data || [] });
}

