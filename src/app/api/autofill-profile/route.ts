import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function buildAutofillData(candidate: any, fallbackEmail?: string) {
  const names = (candidate.full_name || '').trim().split(/\s+/);
  const firstName = names[0] || '';
  const lastName = names.slice(1).join(' ') || '';
  const latestExp = Array.isArray(candidate.experience) ? candidate.experience[0] : null;
  const totalYears = Array.isArray(candidate.experience) ? candidate.experience.length : 0;
  const latestEdu = Array.isArray(candidate.education) ? candidate.education[0] : null;

  return {
    fullName: candidate.full_name || '',
    firstName,
    lastName,
    email: candidate.email || fallbackEmail || '',
    phone: candidate.phone || '',
    location: candidate.location || '',
    visaStatus: candidate.visa_status || '',
    currentTitle: latestExp?.title || candidate.primary_title || '',
    currentCompany: latestExp?.company || '',
    yearsExperience: String(totalYears || ''),
    linkedinUrl: candidate.linkedin_url || '',
    portfolioUrl: candidate.portfolio_url || '',
    summary: candidate.summary || '',
    skills: Array.isArray(candidate.skills) ? candidate.skills.join(', ') : '',
    degree: latestEdu?.degree || '',
    school: latestEdu?.institution || '',
    graduationDate: latestEdu?.graduation_date || '',
  };
}

const CANDIDATE_FIELDS = 'id, full_name, email, phone, location, visa_status, primary_title, secondary_titles, skills, summary, linkedin_url, portfolio_url, experience, education, certifications';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json(
      { error: 'Missing authorization token' },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, name, email')
    .eq('id', user.id)
    .single();

  const role = profile?.role || 'candidate';
  const candidateId = req.nextUrl.searchParams.get('candidate_id');

  // ── Candidate: return their own profile ──
  if (role === 'candidate') {
    const { data: candidate } = await supabase
      .from('candidates')
      .select(CANDIDATE_FIELDS)
      .eq('user_id', user.id)
      .single();

    if (!candidate) {
      return NextResponse.json(
        { error: 'No candidate profile found' },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    return NextResponse.json(buildAutofillData(candidate, user.email), { headers: CORS_HEADERS });
  }

  // ── Admin or Recruiter: list candidates or fetch a specific one ──
  if (role !== 'admin' && role !== 'recruiter') {
    return NextResponse.json({ error: 'Unauthorized role' }, { status: 403, headers: CORS_HEADERS });
  }

  // If no candidate_id, return the list of available candidates
  if (!candidateId) {
    let candidateRows: any[] = [];

    if (role === 'admin') {
      const { data } = await supabase
        .from('candidates')
        .select('id, full_name, email, primary_title, active')
        .order('full_name');
      candidateRows = data || [];
    } else {
      // Recruiter: only their assigned candidates
      const { data: assignments } = await supabase
        .from('recruiter_candidate_assignments')
        .select('candidate_id')
        .eq('recruiter_id', user.id);

      const ids = (assignments || []).map((a: any) => a.candidate_id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from('candidates')
          .select('id, full_name, email, primary_title, active')
          .in('id', ids)
          .order('full_name');
        candidateRows = data || [];
      }
    }

    return NextResponse.json(
      {
        mode: 'select_candidate',
        role,
        userName: profile?.name || profile?.email || '',
        candidates: candidateRows.map((c: any) => ({
          id: c.id,
          name: c.full_name || c.email || 'Unknown',
          title: c.primary_title || '',
          active: c.active,
        })),
      },
      { headers: CORS_HEADERS },
    );
  }

  // Fetch the specific candidate
  if (role === 'recruiter') {
    const { data: assignment } = await supabase
      .from('recruiter_candidate_assignments')
      .select('candidate_id')
      .eq('recruiter_id', user.id)
      .eq('candidate_id', candidateId)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: 'Candidate not assigned to you' },
        { status: 403, headers: CORS_HEADERS },
      );
    }
  }

  const { data: candidate } = await supabase
    .from('candidates')
    .select(CANDIDATE_FIELDS)
    .eq('id', candidateId)
    .single();

  if (!candidate) {
    return NextResponse.json(
      { error: 'Candidate not found' },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(buildAutofillData(candidate), { headers: CORS_HEADERS });
}
