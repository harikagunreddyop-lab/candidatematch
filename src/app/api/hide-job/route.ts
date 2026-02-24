import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/** POST { candidate_id, job_id, reason? } — candidate marks job as "not interested" / hidden. */
export async function POST(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['candidate'] });
  if (authResult instanceof Response) return authResult;

  const body = await req.json().catch(() => ({}));
  const candidateId = body?.candidate_id;
  const jobId = body?.job_id;
  if (!candidateId || !jobId) {
    return NextResponse.json({ error: 'candidate_id and job_id required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: c } = await supabase
    .from('candidates')
    .select('id')
    .eq('id', candidateId)
    .eq('user_id', authResult.user.id)
    .single();
  if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase.from('candidate_hidden_jobs').upsert(
    { candidate_id: candidateId, job_id: jobId, reason: body.reason || null },
    { onConflict: 'candidate_id,job_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** DELETE ?candidate_id= & job_id= — unhide. */
export async function DELETE(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['candidate'] });
  if (authResult instanceof Response) return authResult;

  const candidateId = req.nextUrl.searchParams.get('candidate_id');
  const jobId = req.nextUrl.searchParams.get('job_id');
  if (!candidateId || !jobId) {
    return NextResponse.json({ error: 'candidate_id and job_id required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: c } = await supabase
    .from('candidates')
    .select('id')
    .eq('id', candidateId)
    .eq('user_id', authResult.user.id)
    .single();
  if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await supabase.from('candidate_hidden_jobs').delete().eq('candidate_id', candidateId).eq('job_id', jobId);
  return NextResponse.json({ ok: true });
}
