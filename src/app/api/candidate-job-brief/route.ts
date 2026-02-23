// Per-job AI brief for the candidate: why this score, what matched, what's missing, how to improve.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const authResult = await requireApiAuth(req);
  if (authResult instanceof Response) return authResult;
  const { user, profile } = authResult;

  if (profile.role !== 'candidate') {
    return NextResponse.json({ error: 'Only candidates can request a job brief' }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const job_id = body.job_id;
  if (!job_id) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, full_name, primary_title, skills, summary, location, years_of_experience')
    .eq('user_id', user.id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });

  const [{ data: job }, { data: match }] = await Promise.all([
    supabase.from('jobs').select('id, title, company, location, jd_clean, remote_type, job_type').eq('id', job_id).single(),
    supabase
      .from('candidate_job_matches')
      .select('fit_score, match_reason, matched_keywords, missing_keywords')
      .eq('candidate_id', candidate.id)
      .eq('job_id', job_id)
      .single(),
  ]);

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const skills = Array.isArray(candidate.skills) ? candidate.skills : (candidate.skills ? JSON.parse(String(candidate.skills)) : []);
  const matched = (match?.matched_keywords || []) as string[];
  const missing = (match?.missing_keywords || []) as string[];
  const score = match?.fit_score ?? null;
  const reason = match?.match_reason || '';

  const prompt = `You are a career coach. Write a short, honest brief FOR THE CANDIDATE (not the recruiter) about their fit for this specific role.

ROLE: ${job.title} at ${job.company}
${job.location ? `Location: ${job.location}` : ''}
${job.remote_type ? `Remote: ${job.remote_type}` : ''}
${job.jd_clean ? `Job description (excerpt): ${String(job.jd_clean).slice(0, 600)}...` : ''}

CANDIDATE: ${candidate.full_name}, ${candidate.primary_title || 'N/A'}
${candidate.years_of_experience ? `Experience: ${candidate.years_of_experience} years` : ''}
Skills on profile: ${(skills || []).slice(0, 12).join(', ') || 'Not listed'}
${candidate.summary ? `Summary: ${String(candidate.summary).slice(0, 300)}` : ''}

ATS SCORE: ${score != null ? `${score}/100` : 'Not scored'}
Match reason (from system): ${reason || 'N/A'}
Matched keywords/skills: ${matched.length ? matched.join(', ') : 'None'}
Missing keywords/skills: ${missing.length ? missing.join(', ') : 'None'}

Write a brief (for the candidate) with these exact sections. Be specific and use the data above.
**Why this score** — In 2–3 sentences, explain what’s driving this ATS score (what matched well, what didn’t).
**What’s working** — 2–3 bullet points: strengths and matched skills/experience.
**What’s missing** — 2–3 bullet points: gaps or missing skills that pulled the score down (if none, say “No major gaps identified”).
**One thing to improve** — One specific, actionable tip (e.g. add a keyword to resume, highlight a project, or note willingness to learn X).

Keep the whole brief under 200 words. Tone: encouraging but honest.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AI error: ${err}` }, { status: 500 });
    }

    const data = await res.json();
    const brief = data.content?.[0]?.text || '';
    return NextResponse.json({ brief, generated_at: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
