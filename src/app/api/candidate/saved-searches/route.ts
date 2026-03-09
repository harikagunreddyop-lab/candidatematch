/**
 * GET /api/candidate/saved-searches — List saved searches.
 * POST /api/candidate/saved-searches — Create saved search.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ saved_searches: [] });
  }

  const { data, error } = await supabase
    .from('candidate_saved_searches')
    .select('*')
    .eq('candidate_id', candidate.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved_searches: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const searchName = body.search_name || body.name || 'My search';
  const searchParams = body.search_params || body.params || {};
  const alertFrequency = ['daily', 'weekly', 'instant'].includes(body.alert_frequency) ? body.alert_frequency : null;

  const { data, error } = await supabase
    .from('candidate_saved_searches')
    .insert({
      candidate_id: candidate.id,
      search_name: searchName,
      search_params: searchParams,
      alert_frequency: alertFrequency,
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved_search: data });
}
