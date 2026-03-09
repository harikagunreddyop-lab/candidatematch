/**
 * POST /api/recruiter/dashboard/follow-up-message — Generate AI follow-up message for a candidate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    if (!ANTHROPIC_API_KEY)
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const { candidate_id, application_id, context } = body;
    if (!candidate_id)
      return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });

    const supabase = createServiceClient();

    const { data: companyJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('company_id', companyId);
    const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);
    if (jobIds.length === 0)
      return NextResponse.json({ error: 'No company jobs' }, { status: 403 });

    if (application_id) {
      const { data: appScope } = await supabase
        .from('applications')
        .select('id')
        .eq('id', application_id)
        .eq('candidate_id', candidate_id)
        .in('job_id', jobIds)
        .maybeSingle();
      if (!appScope) {
        return NextResponse.json({ error: 'Candidate is outside your company scope' }, { status: 403 });
      }
    } else {
      const { data: appScope } = await supabase
        .from('applications')
        .select('id')
        .eq('candidate_id', candidate_id)
        .in('job_id', jobIds)
        .limit(1)
        .maybeSingle();
      if (!appScope) {
        return NextResponse.json({ error: 'Candidate is outside your company scope' }, { status: 403 });
      }
    }

    const { data: candidate } = await supabase
      .from('candidates')
      .select('id, full_name, primary_title, email')
      .eq('id', candidate_id)
      .single();
    if (!candidate)
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

    let jobTitle = 'the role';
    let appStatus = '';
    if (application_id) {
      const { data: app } = await supabase
        .from('applications')
        .select('status, job:jobs(title)')
        .eq('id', application_id)
        .in('job_id', jobIds)
        .single();
      if (app) {
        jobTitle = (app.job && !Array.isArray(app.job) ? (app.job as { title?: string }).title : null) ?? jobTitle;
        appStatus = (app as { status?: string }).status ?? '';
      }
    } else {
      const { data: app } = await supabase
        .from('applications')
        .select('id, status, job:jobs(title)')
        .eq('candidate_id', candidate_id)
        .in('job_id', jobIds)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      if (app) {
        jobTitle = (app.job && !Array.isArray(app.job) ? (app.job as { title?: string }).title : null) ?? jobTitle;
        appStatus = (app as { status?: string }).status ?? '';
      }
    }

    const firstName = (candidate.full_name ?? '').split(' ')[0] || candidate.full_name || 'there';
    const prompt = `Write a short, friendly recruiter follow-up email. 2-3 sentences max. Personal, not templated.
Candidate: ${candidate.full_name}, ${candidate.primary_title ?? 'professional'}
Role: ${jobTitle}
Application status: ${appStatus || 'in progress'}
${context ? `Context: ${context}` : ''}

Start with "Hi ${firstName},". No subject line. Return JSON only: { "subject": "...", "body": "..." }`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AI error: ${err.slice(0, 200)}` }, { status: 500 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        subject: `Follow-up: ${jobTitle}`,
        body: `Hi ${firstName},\n\nI wanted to follow up on your application for ${jobTitle}. We'd love to connect. When might you have a few minutes this week?\n\nBest,\nRecruiting Team`,
      });
    }
    let parsed: { subject?: string; body?: string };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = {};
    }
    return NextResponse.json({
      subject: parsed.subject ?? `Follow-up: ${jobTitle}`,
      body: parsed.body ?? `Hi ${firstName},\n\nFollowing up on your application for ${jobTitle}. When can we connect?\n\nBest,\nRecruiting Team`,
    });
  } catch (e) {
    return handleAPIError(e);
  }
}
