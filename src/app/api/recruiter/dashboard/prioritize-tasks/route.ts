/**
 * POST /api/recruiter/dashboard/prioritize-tasks — AI re-prioritize daily tasks (Claude).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import type { DailyTask } from '@/types/recruiter-dashboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    if (!ANTHROPIC_API_KEY)
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const tasks: DailyTask[] = Array.isArray(body.tasks) ? body.tasks : [];
    if (tasks.length === 0)
      return NextResponse.json({ tasks: [] });

    const summary = tasks
      .slice(0, 15)
      .map(
        (t, i) =>
          `${i + 1}. [${t.type}] ${t.title} - ${t.description} (score: ${t.priority_score}, ~${t.estimated_time_minutes}min)`
      )
      .join('\n');

    const prompt = `You are a recruiting productivity coach. Given this list of tasks for today, reorder and optionally adjust priority_score (0-100) and estimated_time_minutes so the recruiter tackles the most impactful work first.

Consider: application deadlines, hot leads, urgent roles, time-sensitive offers, and batching similar tasks.

TASKS:
${summary}

Return a JSON array of the same task objects in the new order. Keep each object's id, type, title, description, related_* fields unchanged. You may update priority_score and estimated_time_minutes. Add or keep ai_reasoning with a one-line reason for position. Return ONLY the JSON array, no markdown.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Claude API error: ${err.slice(0, 200)}` }, { status: 500 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ tasks }); // return original on parse failure
    }
    let parsed: DailyTask[];
    try {
      parsed = JSON.parse(jsonMatch[0]) as DailyTask[];
    } catch {
      return NextResponse.json({ tasks });
    }
    if (!Array.isArray(parsed) || parsed.length === 0)
      return NextResponse.json({ tasks });
    // Preserve original fields that might be missing from AI output
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const merged = parsed.map((p) => {
      const orig = byId.get(p.id);
      return {
        ...orig,
        ...p,
        id: p.id ?? orig?.id,
        type: p.type ?? orig?.type,
        title: p.title ?? orig?.title,
        description: p.description ?? orig?.description,
      } as DailyTask;
    });
    return NextResponse.json({ tasks: merged });
  } catch (e) {
    return handleAPIError(e);
  }
}
