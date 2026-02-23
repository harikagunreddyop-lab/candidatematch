import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile.data?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const candidateId = searchParams.get('candidate_id');
  if (!candidateId) return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });

  const { data: candidate } = await supabase.from('candidates').select('*').eq('id', candidateId).single();
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  const [appsRes, matchesRes] = await Promise.all([
    supabase.from('applications').select('id, job_id, status, applied_at, candidate_notes, interview_notes, interview_date, created_at, updated_at, job:jobs(title, company, location)').eq('candidate_id', candidateId).order('updated_at', { ascending: false }),
    supabase.from('candidate_job_matches').select('id, job_id, fit_score, matched_at, job:jobs(title, company, location)').eq('candidate_id', candidateId).order('fit_score', { ascending: false }).limit(200),
  ]);

  const applications = appsRes.data || [];
  const matches = matchesRes.data || [];

  const exportData = {
    exported_at: new Date().toISOString(),
    exported_by_admin: true,
    candidate: {
      id: candidate.id,
      full_name: candidate.full_name,
      email: candidate.email,
      phone: candidate.phone,
      location: candidate.location,
      primary_title: candidate.primary_title,
      summary: candidate.summary,
      skills: candidate.skills,
      default_pitch: candidate.default_pitch,
      salary_min: candidate.salary_min,
      salary_max: candidate.salary_max,
      availability: candidate.availability,
      open_to_remote: candidate.open_to_remote,
      last_seen_matches_at: candidate.last_seen_matches_at,
    },
    applications: applications.map((a: any) => ({
      job_title: a.job?.title,
      company: a.job?.company,
      location: a.job?.location,
      status: a.status,
      applied_at: a.applied_at,
      candidate_notes: a.candidate_notes,
      interview_notes: a.interview_notes,
      interview_date: a.interview_date,
      updated_at: a.updated_at,
    })),
    matches: matches.map((m: any) => ({
      job_title: m.job?.title,
      company: m.job?.company,
      location: m.job?.location,
      fit_score: m.fit_score,
      matched_at: m.matched_at,
    })),
  };

  return NextResponse.json(exportData);
}
