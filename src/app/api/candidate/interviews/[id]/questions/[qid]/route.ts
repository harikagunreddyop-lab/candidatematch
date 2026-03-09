/**
 * PATCH /api/candidate/interviews/[id]/questions/[qid] — Update a prep question (answer, STAR, feedback).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

async function getCandidateId(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await supabase.from('candidates').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; qid: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id, qid } = await params;
  if (!id || !qid) return NextResponse.json({ error: 'id and qid required' }, { status: 400 });

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  const { data: interview } = await supabase
    .from('interviews')
    .select('id')
    .eq('id', id)
    .eq('candidate_id', candidateId)
    .single();
  if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (body.candidate_answer !== undefined) update.candidate_answer = body.candidate_answer;
  if (body.star_method !== undefined) update.star_method = body.star_method;
  if (body.ai_feedback !== undefined) update.ai_feedback = body.ai_feedback;
  if (body.is_practiced !== undefined) update.is_practiced = Boolean(body.is_practiced);
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  const { data, error } = await supabase
    .from('interview_questions_prep')
    .update(update)
    .eq('id', qid)
    .eq('interview_id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
