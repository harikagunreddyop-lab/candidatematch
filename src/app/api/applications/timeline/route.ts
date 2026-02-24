import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/** GET ?application_id= — returns status history for an application (admin/recruiter or candidate who owns it). */
export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;

  const applicationId = req.nextUrl.searchParams.get('application_id');
  if (!applicationId) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: app } = await supabase.from('applications').select('candidate_id').eq('id', applicationId).single();
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  if (authResult.profile.role === 'candidate') {
    const { data: c } = await supabase.from('candidates').select('id').eq('id', app.candidate_id).eq('user_id', authResult.user.id).single();
    if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else if (authResult.profile.role === 'recruiter') {
    const { data: a } = await supabase.from('recruiter_candidate_assignments').select('recruiter_id').eq('candidate_id', app.candidate_id).eq('recruiter_id', authResult.profile.id).single();
    if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('application_status_history')
    .select('*, actor:profiles!actor_id(id, name, email)')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ timeline: data ?? [] });
}
