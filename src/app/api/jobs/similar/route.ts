/**
 * GET /api/jobs/similar?job_id=...&limit=5
 * Returns jobs similar to the given job (by skills overlap and title similarity).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id')?.trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10))
  );

  if (!jobId) {
    return NextResponse.json({ error: 'job_id required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, title, company, location, url, salary_min, salary_max, job_type, remote_type, company_logo_url, must_have_skills, nice_to_have_skills, scraped_at, expires_at')
    .eq('id', jobId)
    .eq('is_active', true)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const skills = [
    ...(Array.isArray(job.must_have_skills) ? job.must_have_skills : []),
    ...(Array.isArray(job.nice_to_have_skills) ? job.nice_to_have_skills : []),
  ].filter(Boolean);
  const titleWords = (job.title || '')
    .toLowerCase()
    .split(/\W+/)
    .filter((w: string) => w.length > 1)
    .slice(0, 5);

  let q = supabase
    .from('jobs')
    .select('id, title, company, location, url, salary_min, salary_max, job_type, remote_type, company_logo_url, scraped_at, expires_at, must_have_skills, nice_to_have_skills')
    .eq('is_active', true)
    .neq('id', jobId);

  if (skills.length > 0) {
    q = q.overlaps('must_have_skills', skills);
  }

  const { data: candidates, error: listErr } = await q
    .order('scraped_at', { ascending: false })
    .limit(limit * 3);

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const scored = (candidates ?? []).map((j: any) => {
    let score = 0;
    const jSkills = [
      ...(Array.isArray(j.must_have_skills) ? j.must_have_skills : []),
      ...(Array.isArray(j.nice_to_have_skills) ? j.nice_to_have_skills : []),
    ].map((s: string) => s.toLowerCase());
    const skillOverlap = skills.filter((s) =>
      jSkills.some((js: string) => js.includes(s) || (typeof s === 'string' && s.includes(js)))
    ).length;
    score += skillOverlap * 10;
    const jTitle = (j.title || '').toLowerCase();
    const titleMatch = titleWords.filter((w: string) => jTitle.includes(w)).length;
    score += titleMatch * 5;
    if (j.company === job.company) score += 3;
    return { ...j, _similarity: score };
  });

  scored.sort((a: any, b: any) => (b._similarity ?? 0) - (a._similarity ?? 0));
  const similar = scored.slice(0, limit).map(({ _similarity, ...j }: any) => ({
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location ?? null,
    url: j.url ?? null,
    salary_min: j.salary_min ?? null,
    salary_max: j.salary_max ?? null,
    job_type: j.job_type ?? null,
    remote_type: j.remote_type ?? null,
    company_logo_url: j.company_logo_url ?? null,
    scraped_at: j.scraped_at ?? null,
    expires_at: j.expires_at ?? null,
    must_have_skills: j.must_have_skills ?? [],
    nice_to_have_skills: j.nice_to_have_skills ?? [],
  }));

  return NextResponse.json({ job_id: jobId, similar });
}
