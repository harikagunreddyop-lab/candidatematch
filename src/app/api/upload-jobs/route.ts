import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/api-auth';
import { stripHtml } from '@/utils/helpers';
import { runMatching } from '@/lib/matching';
import { log as devLog, error as logError } from '@/lib/logger';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();

  try {
    const body = await req.json();
    const rows: any[] = body.jobs;
    const skipMatching: boolean = body.skip_matching ?? false;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No jobs provided' }, { status: 400 });
    }

    let inserted = 0;
    let duplicates = 0;
    let skipped = 0;

    for (const row of rows) {
      const job = normalizeRow(row);
      if (!job) { skipped++; continue; }

      const hash = makeHash(job);

      const { data: existing } = await supabase
        .from('jobs')
        .select('id')
        .or(
          `dedupe_hash.eq.${hash}` +
          (job.source_job_id
            ? `,and(source.eq.${job.source},source_job_id.eq.${job.source_job_id})`
            : '')
        )
        .limit(1);

      if (existing?.length) { duplicates++; continue; }

      const { error } = await supabase.from('jobs').insert({
        ...job,
        dedupe_hash: hash,
        is_active: true,
        scraped_at: new Date().toISOString(),
      });

      if (!error) inserted++;
      else logError('[upload-jobs] insert error:', error.message);
    }

    if (!skipMatching && inserted > 0) {
      devLog(`[upload-jobs] ${inserted} new jobs inserted — starting matching in background.`);
      runMatching(undefined, (m) => devLog('[MATCH] ' + m)).catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        logError('[upload-jobs] Background matching failed:', errMsg);
      });
    }

    return NextResponse.json({
      inserted,
      duplicates,
      skipped,
      total: rows.length,
      matching: inserted > 0 && !skipMatching
        ? { status: 'started', message: 'Matching is running in the background. Check logs or candidate matches in a few minutes.' }
        : {
            status: 'skipped',
            reason: inserted === 0 ? 'no new jobs inserted' : 'skip_matching=true',
          },
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function normalizeRow(row: any): Record<string, any> | null {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = row?.[k];
      if (v !== undefined && v !== null && v !== 'None' && String(v).trim() !== '') {
        return String(v).trim();
      }
    }
    return '';
  };

  // ✅ Apify LinkedIn export columns: job_title, company_name, description_text, job_url/apply_url
  const title = pick('job_title', 'title', 'Title', 'jobtitle', 'position', 'Job Title');
  const company = pick('company_name', 'company/name', 'company', 'Company', 'companyName', 'employer', 'Organization');
  const location = pick(
    'location',
    'location/linkedinText', 'location/parsed/text', 'location/parsed/city',
    'Location', 'city', 'City'
  );
  const url = pick(
    'job_url', 'apply_url',
    'linkedinUrl', 'applyMethod/companyApplyUrl', 'easyApplyUrl',
    'url', 'URL', 'link', 'Job URL'
  );
  const sourceJobId = pick('job_id', 'jobId', 'source_job_id', 'id');

  const jdRaw = pick(
    'description_html', 'description_text',
    'descriptionHtml', 'descriptionText',
    'description',
    'job_description', 'jd', 'jd_clean', 'Description'
  );

  const jdClean = jdRaw
    ? (jdRaw.trim().startsWith('<') ? stripHtml(jdRaw) : jdRaw)
    : '';

  const salaryMin = parseNum(pick('salary/min', 'salaryMin', 'salary_min', 'Salary Min'));
  const salaryMax = parseNum(pick('salary/max', 'salaryMax', 'salary_max', 'Salary Max'));

  const employmentType = pick('employmentType', 'employment_type', 'employment_type', 'job_type', 'jobType', 'Job Type', 'employment_type');
  const workplaceType  = pick('workplaceType', 'remote_type', 'workRemoteAllowed', 'Remote');

  if (!title || !company) return null;

  return {
    source: 'linkedin',
    source_job_id: sourceJobId || null,
    title,
    company,
    location: location || null,
    url: url || null,
    jd_raw: jdRaw || null,
    jd_clean: jdClean || null,
    salary_min: salaryMin,
    salary_max: salaryMax,
    job_type: normalizeJobType(employmentType),
    remote_type: normalizeRemoteType(workplaceType),
  };
}

function parseNum(val: string): number | null {
  const n = parseFloat(String(val || '').replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function normalizeJobType(raw: string): string | null {
  if (!raw) return null;
  const map: Record<string, string> = {
    full_time: 'full-time', fulltime: 'full-time', 'full-time': 'full-time',
    part_time: 'part-time', parttime: 'part-time', 'part-time': 'part-time',
    contract: 'contract', temporary: 'temporary',
    internship: 'internship', volunteer: 'volunteer',
  };
  return map[raw.toLowerCase().replace(/[\s-]/g, '_')] || raw;
}

function normalizeRemoteType(raw: string): string | null {
  if (!raw || raw === 'None' || raw === 'false') return null;
  if (raw === 'true') return 'remote';
  const map: Record<string, string> = {
    remote: 'remote', on_site: 'on-site', onsite: 'on-site',
    hybrid: 'hybrid', 'on-site': 'on-site',
  };
  return map[raw.toLowerCase().replace(/[\s-]/g, '_')] || raw;
}

function makeHash(j: any) {
  return crypto
    .createHash('sha256')
    .update(
      [j.title, j.company, j.location, (j.jd_clean || '').slice(0, 500)]
        .map((s: string) => (s || '').toLowerCase().trim())
        .join('|')
    )
    .digest('hex');
}