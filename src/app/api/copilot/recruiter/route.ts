import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { buildFixReport } from '@/lib/fix-report';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const supabase = createServiceClient();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const matchId = body.match_id ? String(body.match_id).trim() : null;
  if (!matchId) {
    return NextResponse.json({ error: 'match_id is required' }, { status: 400 });
  }

  // Feature flag: copilot.recruiter.enabled
  try {
    const { data: flagRow } = await supabase
      .from('feature_flags')
      .select('value')
      .eq('key', 'copilot.recruiter.enabled')
      .maybeSingle();
    const enabled = flagRow?.value === true || flagRow?.value === 'true' || flagRow?.value === '"true"';
    if (!enabled) {
      return NextResponse.json(
        { error: 'Recruiter copilot is disabled (copilot.recruiter.enabled flag).' },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Feature flags not available; recruiter copilot disabled.' },
      { status: 503 },
    );
  }

  const { data: matchRow, error } = await supabase
    .from('candidate_job_matches')
    .select('candidate_id, job_id, ats_score, ats_reason, ats_breakdown')
    .eq('id', matchId)
    .maybeSingle();
  if (error || !matchRow) {
    return NextResponse.json({ error: error?.message || 'Match not found' }, { status: 404 });
  }

  const breakdown = matchRow.ats_breakdown || {};
  const fixReport = buildFixReport({
    total_score: matchRow.ats_score ?? breakdown.total_score ?? 0,
    dimensions: breakdown.dimensions ?? {},
    matched_keywords: breakdown.matched_keywords ?? [],
    missing_keywords: breakdown.missing_keywords ?? [],
    evidence_spans: breakdown.dimensions?.must?.evidence_spans,
    gate_passed: breakdown.gate_passed ?? true,
    negative_signals: breakdown.negative_signals ?? [],
  });

  const prompt = `
You are a principal technical recruiter and ATS expert.
Summarize this candidate→job match in recruiter language, then propose outreach copy and interview questions.

ATS SCORE: ${matchRow.ats_score}
REASON: ${matchRow.ats_reason}

DIMENSIONS (JSON):
${JSON.stringify(breakdown.dimensions || {}, null, 2)}

FIX REPORT:
${fixReport}

Return ONLY valid JSON, no markdown:
{
  "summary": "<2-3 sentence summary>",
  "why_good_fit": ["..."],
  "risks": ["..."],
  "outreach_message": "<email body>",
  "interview_questions": ["question 1", "question 2", "..."]
}
`.trim();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `LLM call failed: ${res.status} ${text.slice(0, 300)}` }, { status: 500 });
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Copilot response not parseable' }, { status: 500 });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return NextResponse.json({ error: 'Copilot JSON parse failed' }, { status: 500 });
  }

  return NextResponse.json({
    match_id: matchId,
    ...parsed,
  });
}

