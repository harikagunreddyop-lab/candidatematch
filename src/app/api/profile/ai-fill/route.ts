/**
 * POST — Use AI to extract profile fields from resume text and update the candidate record.
 * - Candidates: can autofill their own profile.
 * - Recruiters/Admins: can autofill for a specific candidate_id they have access to.
 * Requires parsed_resume_text or structured_data from at least one resume.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

export async function POST(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['candidate', 'recruiter', 'admin'] });
  if (authResult instanceof Response) return authResult as NextResponse;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
  }

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({} as any));

  let candidate: any = null;

  if (authResult.profile.role === 'candidate') {
    // Candidate: always operate on their own candidate record (ignore candidate_id from body).
    const { data } = await supabase
      .from('candidates')
      .select('id, user_id, full_name, primary_title, email, phone, location, linkedin_url, portfolio_url, summary, default_pitch, skills, experience, education, visa_status, years_of_experience, parsed_resume_text')
      .eq('user_id', authResult.user.id)
      .single();
    candidate = data;
  } else {
    // Recruiter/Admin: require explicit candidate_id and access check.
    const candidateId = String(body.candidate_id || '');
    if (!candidateId) {
      return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 });
    }

    const allowed = await canAccessCandidate(authResult, candidateId, supabase);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('candidates')
      .select('id, user_id, full_name, primary_title, email, phone, location, linkedin_url, portfolio_url, summary, default_pitch, skills, experience, education, visa_status, years_of_experience, parsed_resume_text')
      .eq('id', candidateId)
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    candidate = data;
  }

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
  }

  let resumeText = (candidate.parsed_resume_text || '').trim();
  if (resumeText.length < 100) {
    const { data: resumes } = await supabase
      .from('candidate_resumes')
      .select('structured_data')
      .eq('candidate_id', candidate.id)
      .order('uploaded_at', { ascending: false })
      .limit(1);
    const sd = resumes?.[0]?.structured_data;
    if (sd && typeof sd === 'object') {
      resumeText = JSON.stringify(sd);
    } else if (sd && typeof sd === 'string') {
      resumeText = sd;
    }
  }
  if (resumeText.length < 100) {
    return NextResponse.json(
      { error: 'Upload at least one resume first so we can extract your profile from it. Go to My Resumes and upload a PDF.' },
      { status: 400 }
    );
  }

  const systemPrompt = `You are a precise profile extractor. Extract structured data from the resume text and return ONLY valid JSON (no markdown, no explanation) in this exact shape. Use null for missing fields. For arrays use [] if none.
{
  "full_name": "string or null",
  "primary_title": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "linkedin_url": "string or null",
  "portfolio_url": "string or null",
  "summary": "string or null (2-4 sentences professional summary)",
  "default_pitch": "string or null (1-2 sentence elevator pitch)",
  "visa_status": "string or null",
  "years_of_experience": number or null,
  "skills": ["string"],
  "experience": [{"title": "string", "company": "string", "start_date": "string", "end_date": "string", "current": boolean}],
  "education": [{"degree": "string", "field": "string", "institution": "string", "graduation_date": "string"}]
}`;

  const userPrompt = `Extract profile from this resume. Return only the JSON object.\n\n---\n${resumeText.slice(0, 12000)}\n---`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'AI extraction failed: ' + (err || res.statusText) }, { status: 502 });
    }
    const data = await res.json();
    const text = (data.content?.[0] as any)?.text;
    if (!text) {
      return NextResponse.json({ error: 'AI returned no content' }, { status: 502 });
    }
    const raw = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const extracted = JSON.parse(raw) as Record<string, unknown>;

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (extracted.full_name != null && String(extracted.full_name).trim()) payload.full_name = String(extracted.full_name).trim();
    if (extracted.primary_title != null && String(extracted.primary_title).trim()) payload.primary_title = String(extracted.primary_title).trim();
    if (extracted.phone != null && String(extracted.phone).trim()) payload.phone = String(extracted.phone).trim();
    if (extracted.location != null && String(extracted.location).trim()) payload.location = String(extracted.location).trim();
    if (extracted.linkedin_url != null && String(extracted.linkedin_url).trim()) payload.linkedin_url = String(extracted.linkedin_url).trim();
    if (extracted.portfolio_url != null && String(extracted.portfolio_url).trim()) payload.portfolio_url = String(extracted.portfolio_url).trim();
    if (extracted.summary != null && String(extracted.summary).trim()) payload.summary = String(extracted.summary).trim();
    if (extracted.default_pitch != null && String(extracted.default_pitch).trim()) payload.default_pitch = String(extracted.default_pitch).trim();
    if (extracted.visa_status != null && String(extracted.visa_status).trim()) payload.visa_status = String(extracted.visa_status).trim();
    if (typeof extracted.years_of_experience === 'number') payload.years_of_experience = extracted.years_of_experience;
    if (Array.isArray(extracted.skills)) payload.skills = extracted.skills.filter((s): s is string => typeof s === 'string');
    if (Array.isArray(extracted.experience)) payload.experience = extracted.experience;
    if (Array.isArray(extracted.education)) payload.education = extracted.education;

    const { data: updated, error } = await supabase
      .from('candidates')
      .update(payload)
      .eq('id', candidate.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (payload.full_name && candidate.user_id) {
      await supabase.from('profiles').update({ name: String(payload.full_name), updated_at: new Date().toISOString() }).eq('id', candidate.user_id);
    }

    return NextResponse.json({ ok: true, candidate: updated });
  } catch (e: any) {
    if (e.message && /JSON|parse/i.test(e.message)) {
      return NextResponse.json({ error: 'AI response was not valid JSON. Try again or edit profile manually.' }, { status: 502 });
    }
    return NextResponse.json({ error: e.message || 'Autofill failed' }, { status: 500 });
  }
}
