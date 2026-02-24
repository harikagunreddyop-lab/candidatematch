// src/app/api/recruiter-ai/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireRecruiterOrAdmin } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authResult = await requireRecruiterOrAdmin(req);
  if (authResult instanceof Response) return authResult;
  const { profile } = authResult;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { type, candidate_id, job_id } = body || {};

  if (!type || !candidate_id || !job_id) {
    return NextResponse.json({ error: 'type, candidate_id, job_id required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  if (profile.role === 'recruiter') {
    const { data: a } = await supabase.from('recruiter_candidate_assignments').select('recruiter_id').eq('candidate_id', candidate_id).eq('recruiter_id', profile.id).single();
    if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [{ data: candidate }, { data: job }, { data: match }] = await Promise.all([
    supabase.from('candidates').select('*').eq('id', candidate_id).single(),
    supabase.from('jobs').select('*').eq('id', job_id).single(),
    supabase.from('candidate_job_matches')
      .select('fit_score, match_reason, matched_keywords, missing_keywords')
      .eq('candidate_id', candidate_id)
      .eq('job_id', job_id)
      .single(),
  ]);

  if (!candidate || !job) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const salary = candidate.salary_min
    ? `$${Math.round(candidate.salary_min / 1000)}k${candidate.salary_max ? `–$${Math.round(candidate.salary_max / 1000)}k` : '+'}`
    : 'Not specified';

  const cCtx = [
    `Name: ${candidate.full_name}`,
    `Title: ${candidate.primary_title}`,
    `Skills: ${(candidate.skills || []).join(', ')}`,
    `Experience: ${candidate.years_of_experience || 'Unknown'} years`,
    `Location: ${candidate.location || 'Not specified'}`,
    `Visa: ${candidate.visa_status || 'Not specified'}`,
    `Salary: ${salary}`,
    `Availability: ${candidate.availability || 'Not specified'}`,
    `Summary: ${candidate.summary || 'None'}`,
  ].join('\n');

  const jCtx = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location || 'Not specified'}`,
    `Type: ${[job.job_type, job.remote_type].filter(Boolean).join(', ') || 'Not specified'}`,
    `Fit Score: ${match?.fit_score ?? 'N/A'}/100`,
    `Match Reason: ${match?.match_reason || 'N/A'}`,
    `Matched Skills: ${(match?.matched_keywords || []).join(', ') || 'None'}`,
    `Missing Skills: ${(match?.missing_keywords || []).join(', ') || 'None'}`,
  ].join('\n');

  let prompt = '';
  let maxTokens = 900;

  if (type === 'brief') {
    prompt = `You are an expert recruiter coach. Write a concise pre-call brief for a recruiter about to speak with this candidate about this role.

CANDIDATE:
${cCtx}

JOB:
${jCtx}

Use these exact sections:
**🎯 Quick Summary** (2 sentences on overall fit)
**💬 Opening Talking Points** (3 bullet points)
**✅ Candidate Strengths** (3 specific strengths from their profile)
**⚠️ Concerns to Address** (2–3 proactive points)
**💰 Compensation Alignment** (1–2 sentences)
**❓ Discovery Questions** (3 smart questions to ask)`;
  } else if (type === 'email') {
    const firstName = candidate.full_name?.split(' ')[0] || candidate.full_name;
    maxTokens = 400;
    prompt = `Write a short, personalized recruiter outreach email. Human, not templated. 2–3 short paragraphs. No subject line.

Candidate: ${candidate.full_name}, ${candidate.primary_title}
Key skills: ${(candidate.skills || []).slice(0, 5).join(', ')}
Role: ${job.title} at ${job.company}${job.location ? ` (${job.location})` : ''}
Why they fit: ${match?.match_reason || ''}

Start with "Hi ${firstName},"`;
  } else {
    return NextResponse.json({ error: 'type must be "brief" or "email"' }, { status: 400 });
  }

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
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 });
    }

    const data = await res.json();
    const result = data.content?.[0]?.text || '';
    return NextResponse.json({ result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}