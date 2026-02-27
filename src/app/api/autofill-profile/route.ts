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

  // Derive GitHub URL: check portfolio_url for github.com, or dedicated github_url field if it exists
  const portfolioUrl = candidate.portfolio_url || '';
  const githubUrl = candidate.github_url ||
    (portfolioUrl.includes('github.com') ? portfolioUrl : '');

  // Work authorization: derive booleans from visa_status string
  // Assumption: any status not containing 'require' or 'need' implies authorized
  const visaStatus = (candidate.visa_status || '').toLowerCase();
  const requiresSponsorship = visaStatus.includes('h1b') || visaStatus.includes('h-1b') ||
    visaStatus.includes('opt') || visaStatus.includes('stem') ||
    visaStatus.includes('require') || visaStatus.includes('needs sponsor');
  const authorizedToWork = !visaStatus.includes('unauthorized') &&
    (visaStatus.includes('citizen') || visaStatus.includes('green card') ||
      visaStatus.includes('ead') || visaStatus.includes('authorized') ||
      visaStatus.includes('work permit') || visaStatus.includes('opt') ||
      visaStatus.length === 0); // unknown → assume yes (safe default)

  // Salary: normalize to strings (forms expect text)
  const salaryMin = candidate.salary_min != null ? String(candidate.salary_min) : '';
  const salaryMax = candidate.salary_max != null ? String(candidate.salary_max) : '';
  const salaryMidpoint = (candidate.salary_min != null && candidate.salary_max != null)
    ? String(Math.round((candidate.salary_min + candidate.salary_max) / 2))
    : salaryMin || salaryMax;

  return {
    // Contact
    fullName: candidate.full_name || '',
    firstName,
    lastName,
    email: candidate.email || fallbackEmail || '',
    phone: candidate.phone || '',
    location: candidate.location || '',
    city: (candidate.location || '').split(',')[0]?.trim() || '',
    state: (candidate.location || '').split(',')[1]?.trim() || '',
    country: (candidate.location || '').split(',')[2]?.trim() || 'United States',
    // Professional
    currentTitle: latestExp?.title || candidate.primary_title || '',
    currentCompany: latestExp?.company || '',
    yearsExperience: String(totalYears || ''),
    linkedinUrl: candidate.linkedin_url || '',
    githubUrl,
    portfolioUrl: portfolioUrl && !portfolioUrl.includes('github.com') ? portfolioUrl : '',
    summary: candidate.summary || '',
    defaultPitch: candidate.default_pitch || '',
    skills: Array.isArray(candidate.skills) ? candidate.skills.join(', ') : '',
    // Education
    degree: latestEdu?.degree || '',
    school: latestEdu?.institution || '',
    major: latestEdu?.major || latestEdu?.field_of_study || '',
    graduationDate: latestEdu?.graduation_date || '',
    // Work auth
    visaStatus: candidate.visa_status || '',
    authorizedToWork,
    requiresSponsorship,
    // Preferences
    salaryMin,
    salaryMax,
    salaryExpectation: salaryMidpoint,
    availability: candidate.availability || '',
    openToRemote: candidate.open_to_remote ?? true,
    openToRelocate: candidate.open_to_relocate ?? false,
  };
}

const CANDIDATE_FIELDS = 'id, full_name, email, phone, location, visa_status, primary_title, secondary_titles, skills, summary, default_pitch, linkedin_url, portfolio_url, github_url, experience, education, certifications, salary_min, salary_max, availability, open_to_remote, open_to_relocate';

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
