/**
 * GET /api/candidate/interviews/[id]/questions — List prep questions for an interview.
 * POST /api/candidate/interviews/[id]/questions — Add a prep question or generate from AI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

async function getCandidateId(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await supabase.from('candidates').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}

function canAccessInterview(
  supabase: ReturnType<typeof createServiceClient>,
  interviewId: string,
  candidateId: string
) {
  return supabase
    .from('interviews')
    .select('id')
    .eq('id', interviewId)
    .eq('candidate_id', candidateId)
    .single();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  const { error: accessErr } = await canAccessInterview(supabase, id, candidateId);
  if (accessErr) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('interview_questions_prep')
    .select('*')
    .eq('interview_id', id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  const { error: accessErr } = await canAccessInterview(supabase, id, candidateId);
  if (accessErr) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.question_text) {
    const { data, error } = await supabase
      .from('interview_questions_prep')
      .insert({
        interview_id: id,
        question_text: String(body.question_text).trim(),
        candidate_answer: body.candidate_answer ?? null,
        star_method: body.star_method ?? null,
        is_practiced: Boolean(body.is_practiced),
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'question_text required' }, { status: 400 });
}
