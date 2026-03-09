/**
 * POST /api/company/jobs/generate-description
 * Generate an AI job description from structured input.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { generateJobDescription } from '@/lib/ai/job-description-generator';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const job_title = typeof body.job_title === 'string' ? body.job_title.trim() : '';
  if (!job_title) {
    return NextResponse.json({ error: 'job_title required' }, { status: 400 });
  }

  const seniority_level = ['entry', 'mid', 'senior', 'lead', 'executive'].includes(body.seniority_level)
    ? body.seniority_level
    : 'mid';
  const work_location = ['remote', 'hybrid', 'onsite'].includes(body.work_location)
    ? body.work_location
    : 'hybrid';

  try {
    const jd = await generateJobDescription({
      job_title,
      department: typeof body.department === 'string' ? body.department : undefined,
      seniority_level,
      key_responsibilities: Array.isArray(body.key_responsibilities) ? body.key_responsibilities.map(String) : undefined,
      required_skills: Array.isArray(body.required_skills) ? body.required_skills.map(String) : undefined,
      company_description: typeof body.company_description === 'string' ? body.company_description : undefined,
      benefits: Array.isArray(body.benefits) ? body.benefits.map(String) : undefined,
      work_location,
      tone: ['formal', 'casual', 'innovative'].includes(body.tone) ? body.tone : undefined,
    });
    return NextResponse.json(jd);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate description';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
