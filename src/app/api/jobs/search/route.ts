/**
 * GET /api/jobs/search
 * Advanced job search with filters. Optional candidate context for match score.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { calculateMatchScore } from '@/lib/job-match-score';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);

  const query = searchParams.get('query')?.trim() || '';
  const location = searchParams.get('location')?.trim() || '';
  const remoteType = searchParams.get('remote_type') || '';
  const salaryMin = searchParams.get('salary_min');
  const salaryMax = searchParams.get('salary_max');
  const jobTypeRaw = searchParams.get('job_type') || '';
  const experienceLevelRaw = searchParams.get('experience_level') || '';
  const skillsRaw = searchParams.get('skills') || '';
  const postedAfter = searchParams.get('posted_after') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || String(DEFAULT_PAGE), 10));
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10)));
  const sortBy = searchParams.get('sort_by') || 'relevance';
  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0753dd'},body:JSON.stringify({sessionId:'0753dd',runId:'initial',hypothesisId:'H3_api_filter_application',location:'src/app/api/jobs/search/route.ts:32',message:'API search params received',data:{query,location,remoteType,salaryMin,salaryMax,jobTypesCount:jobTypeRaw?jobTypeRaw.split(',').filter(Boolean).length:0,experienceLevelsCount:experienceLevelRaw?experienceLevelRaw.split(',').filter(Boolean).length:0,skillsCount:skillsRaw?skillsRaw.split(',').filter(Boolean).length:0,page,limit,sortBy},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const jobTypes = jobTypeRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const experienceLevels = experienceLevelRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const skills = skillsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  let q = supabase
    .from('jobs')
    .select('id, title, company, location, url, jd_clean, jd_raw, salary_min, salary_max, job_type, remote_type, scraped_at, expires_at, created_at, must_have_skills, nice_to_have_skills, min_years_experience, seniority_level, company_logo_url', { count: 'exact' })
    .eq('is_active', true);

  if (query) {
    const pattern = `%${query.replace(/%/g, '\\%')}%`;
    q = q.or(`title.ilike.${pattern},company.ilike.${pattern}`);
  }
  if (location) {
    q = q.ilike('location', `%${location}%`);
  }
  if (remoteType && ['remote', 'hybrid', 'onsite'].includes(remoteType.toLowerCase())) {
    const normalizedRemote = remoteType.toLowerCase();
    if (normalizedRemote === 'onsite') {
      // Handle common stored variants: onsite, on-site, on site, office based.
      q = q.or('remote_type.ilike.%onsite%,remote_type.ilike.%on-site%,remote_type.ilike.%on site%,remote_type.ilike.%office%');
    } else {
      q = q.ilike('remote_type', `%${normalizedRemote}%`);
    }
  }
  if (salaryMin) {
    const n = parseInt(salaryMin, 10);
    if (!Number.isNaN(n)) q = q.or(`salary_max.gte.${n},salary_max.is.null`);
  }
  if (salaryMax) {
    const n = parseInt(salaryMax, 10);
    if (!Number.isNaN(n)) q = q.lte('salary_min', n);
  }
  if (jobTypes.length > 0) {
    q = q.in('job_type', jobTypes);
  }
  if (experienceLevels.length > 0) {
    q = q.in('seniority_level', experienceLevels);
  }
  if (skills.length > 0) {
    q = q.overlaps('must_have_skills', skills);
  }
  if (postedAfter) {
    const d = new Date(postedAfter);
    if (!Number.isNaN(d.getTime())) {
      q = q.gte('scraped_at', d.toISOString());
    }
  }

  if (sortBy === 'date') {
    q = q.order('scraped_at', { ascending: false });
  } else if (sortBy === 'salary') {
    q = q.order('salary_max', { ascending: false, nullsFirst: false });
  } else {
    q = q.order('scraped_at', { ascending: false });
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: jobs, error, count } = await q.range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0753dd'},body:JSON.stringify({sessionId:'0753dd',runId:'initial',hypothesisId:'H3_api_filter_application',location:'src/app/api/jobs/search/route.ts:92',message:'API query result snapshot',data:{remoteTypeParam:remoteType || null,rowCount:Array.isArray(jobs)?jobs.length:0,total:count ?? null,resultRemoteTypes:Array.isArray(jobs)?Array.from(new Set(jobs.map((j:any)=>j?.remote_type ?? null))).slice(0,8):[]},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  let candidate: { id: string; skills?: string[]; years_of_experience?: number; primary_title?: string; location?: string; open_to_remote?: boolean; salary_min?: number; salary_max?: number } | null = null;
  try {
    const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
    if (!(auth instanceof Response)) {
      const { data: c } = await supabase
        .from('candidates')
        .select('id, skills, years_of_experience, primary_title, location, open_to_remote, salary_min, salary_max')
        .eq('user_id', auth.user.id)
        .single();
      candidate = c;
    }
  } catch {
    candidate = null;
  }

  const list = (jobs ?? []).map((job: any) => {
    const row: Record<string, unknown> = {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location ?? null,
      url: job.url ?? null,
      salary_min: job.salary_min ?? null,
      salary_max: job.salary_max ?? null,
      job_type: job.job_type ?? null,
      remote_type: job.remote_type ?? null,
      scraped_at: job.scraped_at ?? null,
      expires_at: job.expires_at ?? null,
      created_at: job.created_at ?? null,
      must_have_skills: job.must_have_skills ?? [],
      nice_to_have_skills: job.nice_to_have_skills ?? [],
      min_years_experience: job.min_years_experience ?? null,
      seniority_level: job.seniority_level ?? null,
      company_logo_url: job.company_logo_url ?? null,
      jd_excerpt: (job.jd_clean ?? job.jd_raw ?? '').toString().replace(/\s+/g, ' ').slice(0, 260) || null,
    };
    if (candidate) {
      const { score, reasons } = calculateMatchScore(
        {
          skills: Array.isArray(candidate.skills) ? candidate.skills : [],
          years_of_experience: candidate.years_of_experience ?? null,
          primary_title: candidate.primary_title ?? null,
          location: candidate.location ?? null,
          open_to_remote: candidate.open_to_remote ?? true,
          salary_min: candidate.salary_min ?? null,
          salary_max: candidate.salary_max ?? null,
        },
        {
          title: job.title,
          location: job.location ?? null,
          remote_type: job.remote_type ?? null,
          salary_min: job.salary_min ?? null,
          salary_max: job.salary_max ?? null,
          must_have_skills: job.must_have_skills ?? null,
          nice_to_have_skills: job.nice_to_have_skills ?? null,
          min_years_experience: job.min_years_experience ?? null,
        }
      );
      row.match_score = score;
      row.match_reasons = reasons;
    }
    return row;
  });

  if (sortBy === 'match_score' && candidate) {
    list.sort((a: any, b: any) => (b.match_score ?? 0) - (a.match_score ?? 0));
  }

  return NextResponse.json({
    jobs: list,
    total: count ?? 0,
    page,
    limit,
    total_pages: Math.ceil((count ?? 0) / limit),
  });
}
