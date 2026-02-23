// src/app/api/candidate-brief/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireRecruiterOrAdmin } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const authResult = await requireRecruiterOrAdmin(req);
  if (authResult instanceof Response) return authResult;
  const { profile } = authResult;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const candidate_id = body.candidate_id;
  if (!candidate_id) return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });

  const supabase = createServiceClient();
  if (profile.role === 'recruiter') {
    const { data: a } = await supabase.from('recruiter_candidate_assignments').select('recruiter_id').eq('candidate_id', candidate_id).eq('recruiter_id', profile.id).single();
    if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  const [candRes, matchRes, appRes, newMatchRes, recentAppRes] = await Promise.all([
    supabase.from('candidates').select('full_name, primary_title, skills, summary, location').eq('id', candidate_id).single(),
    supabase.from('candidate_job_matches').select('fit_score, matched_keywords, missing_keywords, matched_at').eq('candidate_id', candidate_id).order('fit_score', { ascending: false }),
    supabase.from('applications').select('status, applied_at, updated_at, job:jobs(title, company)').eq('candidate_id', candidate_id).order('updated_at', { ascending: false }),
    supabase.from('candidate_job_matches').select('fit_score, job:jobs(title, company)').eq('candidate_id', candidate_id).gte('matched_at', weekAgo).order('fit_score', { ascending: false }).limit(5),
    supabase.from('applications').select('status, updated_at, job:jobs(title, company)').eq('candidate_id', candidate_id).gte('updated_at', weekAgo),
  ]);

  const candidate = candRes.data;
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  const allMatches = matchRes.data || [];
  const allApps = appRes.data || [];
  const newMatches = newMatchRes.data || [];
  const recentApps = recentAppRes.data || [];

  // Skill gap analysis
  const missingSkillFreq: Record<string, number> = {};
  for (const m of allMatches) {
    for (const skill of (m.missing_keywords || [])) {
      missingSkillFreq[skill] = (missingSkillFreq[skill] || 0) + 1;
    }
  }
  const topGaps = Object.entries(missingSkillFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([skill, count]) => `${skill} (needed in ${count} jobs)`);

  const avgScore = allMatches.length > 0
    ? Math.round(allMatches.reduce((s: number, m: any) => s + m.fit_score, 0) / allMatches.length)
    : 0;
  const topScore = allMatches[0]?.fit_score || 0;
  const interviewReadyCount = allMatches.filter((m: any) => m.fit_score >= 82).length;

  const prompt = `You are a career coach AI. Write a personalized weekly career progress report for this candidate.

CANDIDATE: ${candidate.full_name}, ${candidate.primary_title}
LOCATION: ${candidate.location || 'Not specified'}
SKILLS: ${(candidate.skills || []).slice(0, 10).join(', ')}

THIS WEEK:
- New job matches: ${newMatches.length} (top score: ${newMatches[0]?.fit_score || 'N/A'})
- Top new match: ${newMatches[0] ? `${(newMatches[0].job as any)?.title} at ${(newMatches[0].job as any)?.company}` : 'None'}
- Application updates: ${recentApps.length} (${recentApps.map((a: any) => `${(a.job as any)?.title} → ${a.status}`).join(', ') || 'none'})

OVERALL STANDING:
- Total matches: ${allMatches.length}
- Avg ATS score: ${avgScore}/100
- Top ATS score: ${topScore}/100
- Interview-ready matches (80+): ${interviewReadyCount}
- Total applications: ${allApps.length}
- Active pipeline: ${allApps.filter((a: any) => ['applied','screening','interview'].includes(a.status)).length}

TOP SKILL GAPS (skills missing across most job matches):
${topGaps.join('\n') || 'None identified'}

Write a warm, encouraging but honest 4-section brief:
**📊 This Week's Progress** — what happened this week, specific numbers
**🎯 Where You Stand** — honest assessment of ATS scores and pipeline position  
**🧠 Your #1 Skill Gap to Fix** — pick the top gap, explain WHY it matters and HOW to close it (specific course, project, or certification)
**⚡ Action Item for This Week** — one specific, achievable thing to do in the next 7 days

Keep it under 350 words. Be specific, not generic. Use their actual data.`;

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
        max_tokens: 600,
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