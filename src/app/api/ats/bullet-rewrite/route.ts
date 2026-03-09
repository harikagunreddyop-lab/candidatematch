/**
 * POST /api/ats/bullet-rewrite
 *
 * Claude-powered bullet rewrite suggestions with [METRIC_NEEDED] and [TOOL_NEEDED] placeholders.
 * Uses deterministic fix report — Claude only writes human-readable suggestions, never scores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { hasFeature } from '@/lib/feature-flags-server';
import { error as logError } from '@/lib/logger';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const candidateId = String(body.candidate_id || '');
  const jobId = String(body.job_id || '');
  const bullets = Array.isArray(body.bullets) ? body.bullets.map(String).filter(Boolean) : [];
  const missingSkills = Array.isArray(body.missing_skills) ? body.missing_skills.map(String) : [];

  if (!candidateId || !jobId || bullets.length === 0) {
    return NextResponse.json(
      { error: 'candidate_id, job_id, and bullets[] are required' },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const allowed = await canAccessCandidate(auth, candidateId, service);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (auth.profile.role === 'candidate') {
    const runAts = await hasFeature(service, auth.profile.id, 'candidate', 'candidate_see_ats_fix_report', false);
    if (!runAts) return NextResponse.json({ error: 'Fix report not enabled for your account' }, { status: 403 });
  }

  const prompt = `You are a resume coach. Rewrite these resume bullets to be stronger for the role. Use placeholders where the candidate should add specifics:

- [METRIC_NEEDED] — where a number would go (%, $, 2x, etc.)
- [TOOL_NEEDED] — where a specific technology/tool would go
${missingSkills.length > 0 ? `\nMissing skills this role wants (try to incorporate naturally): ${missingSkills.slice(0, 6).join(', ')}` : ''}

Original bullets:
${bullets.map((b: string, i: number) => `${i + 1}. ${b}`).join('\n')}

Return ONLY valid JSON array of strings, one rewritten bullet per element. Keep each under 100 chars. Preserve meaning, add placeholders for metrics/tools. Example: ["Built [TOOL_NEEDED] pipeline that [METRIC_NEEDED] improved latency"]`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      logError('[bullet-rewrite] API error', res.status, await res.text().catch(() => ''));
      return NextResponse.json({ error: 'AI service error' }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\[[\s\S]*\]/);
    const rewritten = match ? JSON.parse(match[0]) : [];
    if (!Array.isArray(rewritten)) {
      return NextResponse.json({ error: 'Invalid response format' }, { status: 502 });
    }

    return NextResponse.json({
      original: bullets,
      rewritten: rewritten.slice(0, bullets.length),
    });
  } catch (e) {
    logError('[bullet-rewrite] failed', e);
    return NextResponse.json({ error: 'Bullet rewrite failed' }, { status: 500 });
  }
}
