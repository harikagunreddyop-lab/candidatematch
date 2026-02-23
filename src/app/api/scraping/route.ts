import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/api-auth';
import { stripHtml } from '@/utils/helpers';
import crypto from 'crypto';
import { runMatching } from '@/lib/matching';
import { log as devLog, error as logError, warn as devWarn } from '@/lib/logger';

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

const INDEED_ACTOR  = 'misceres/indeed-scraper';
const CHEERIO_ACTOR = 'apify/cheerio-scraper';

const APIFY_TIMEOUT_MS = 6 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// GET — return scrape history (admin only)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('scrape_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message, runs: [] }, { status: 500 });
  }
  return NextResponse.json({ runs: data || [] });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — scrape jobs, then auto-trigger matching (admin only)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();
  const {
    search_queries = [],
    sources = [],
    location = '',
    max_results_per_query = 50,
    skip_matching = false, // set true if you want to scrape without matching
  } = await req.json();

  if (!APIFY_TOKEN) {
    return NextResponse.json(
      { error: 'APIFY_API_TOKEN not configured. Add it to your .env file.' },
      { status: 500 }
    );
  }
  if (!search_queries.length || !sources.length) {
    return NextResponse.json(
      { error: 'search_queries and sources are required' },
      { status: 400 }
    );
  }

  const results: any[] = [];
  let totalNewJobs = 0;

  for (const query of search_queries) {
    for (const source of sources) {
      const actorLabel = source === 'linkedin' ? CHEERIO_ACTOR : INDEED_ACTOR;

      const { data: run, error: runErr } = await supabase
        .from('scrape_runs')
        .insert({ actor_id: actorLabel, search_query: query, status: 'running' })
        .select()
        .single();

      if (runErr || !run) {
        results.push({ query, source, error: 'DB insert failed: ' + (runErr?.message || 'unknown') });
        continue;
      }

      try {
        let items: any[] = [];

        if (source === 'indeed') {
          items = await runApifyActor(INDEED_ACTOR, {
            queries: [{ query, location: location || '' }],
            maxResults: max_results_per_query,
            proxy: { useApifyProxy: true },
          });
        } else if (source === 'linkedin') {
          items = await scrapeLinkedInPublic(query, location, max_results_per_query);
        }

        let jobsNew = 0;
        let jobsDupe = 0;

        for (const item of items) {
          const normalized = normalizeJob(item, source);
          if (!normalized?.title || !normalized?.company) continue;

          const hash = makeHash(normalized);

          const { data: existing } = await supabase
            .from('jobs')
            .select('id')
            .or(
              `dedupe_hash.eq.${hash}` +
              (normalized.source_job_id
                ? `,and(source.eq.${source},source_job_id.eq.${normalized.source_job_id})`
                : '')
            )
            .limit(1);

          if (existing?.length) { jobsDupe++; continue; }

          const { error: insertErr } = await supabase.from('jobs').insert({
            ...normalized,
            dedupe_hash: hash,
            is_active: true,
            scraped_at: new Date().toISOString(),
          });

          if (insertErr) {
            logError(`[scraping] insert error for "${normalized.title}":`, insertErr.message);
          } else {
            jobsNew++;
            totalNewJobs++;
          }
        }

        await supabase.from('scrape_runs').update({
          status: 'completed',
          jobs_found: items.length,
          jobs_new: jobsNew,
          jobs_duplicate: jobsDupe,
          completed_at: new Date().toISOString(),
        }).eq('id', run.id);

        results.push({ query, source, jobs_found: items.length, jobs_new: jobsNew, jobs_duplicate: jobsDupe });
      } catch (err: unknown) {
        logError(`[scraping] ${source}/${query}:`, err instanceof Error ? err.message : err);
        const errMsg = err instanceof Error ? err.message : String(err);
        await supabase.from('scrape_runs').update({
          status: 'failed',
          error_message: errMsg,
          completed_at: new Date().toISOString(),
        }).eq('id', run.id);
        results.push({ query, source, error: errMsg });
      }
    }
  }

  if (!skip_matching && totalNewJobs > 0) {
    devLog(`[scraping] ${totalNewJobs} new jobs added — starting matching in background.`);
    runMatching(undefined, (m) => devLog('[MATCH] ' + m)).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logError('[scraping] Background matching failed:', errMsg);
    });
  }

  return NextResponse.json({
    results,
    total_new_jobs: totalNewJobs,
    matching: totalNewJobs > 0 && !skip_matching
      ? { status: 'started', message: 'Matching is running in the background. Check logs or candidate matches in a few minutes.' }
      : { status: 'skipped', reason: totalNewJobs === 0 ? 'no new jobs' : 'skip_matching=true' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Run any Apify actor
// ─────────────────────────────────────────────────────────────────────────────
async function runApifyActor(actorId: string, input: any): Promise<any[]> {
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(`Apify start failed (${startRes.status}): ${text}`);
  }

  const { data: runData } = await startRes.json();
  const apifyRunId = runData?.id;
  const datasetId = runData?.defaultDatasetId;
  if (!apifyRunId) throw new Error('Apify did not return a run ID');

  return pollUntilDone(apifyRunId, datasetId);
}

// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn — 2-step: search results → job detail pages for career URLs
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeLinkedInPublic(query: string, location: string, maxResults: number): Promise<any[]> {
  const encodedQuery    = encodeURIComponent(query);
  const encodedLocation = encodeURIComponent(location || 'United States');
  const startUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodedQuery}&location=${encodedLocation}&f_TPR=r86400`;

  const searchInput = {
    startUrls: [{ url: startUrl }],
    maxRequestsPerCrawl: Math.ceil(maxResults / 25) + 2,
    pageFunction: `
async function pageFunction(context) {
  const { $, request, log } = context;
  const jobs = [];
  $('div.base-card').each(function() {
    const title   = $(this).find('.base-search-card__title').text().trim();
    const company = $(this).find('.base-search-card__subtitle a').text().trim()
                 || $(this).find('.base-search-card__subtitle').text().trim();
    const location = $(this).find('.job-search-card__location').text().trim();
    const url      = $(this).find('a.base-card__full-link').attr('href') || '';
    const jobId    = url.match(/view\\/(\\d+)/)?.[1] || '';
    if (title && company) jobs.push({ title, company, location, linkedinUrl: url, jobId, source: 'linkedin' });
  });
  $('li.jobs-search-results__list-item, li[data-occludable-job-id]').each(function() {
    const title   = $(this).find('.job-card-list__title, .base-search-card__title').text().trim();
    const company = $(this).find('.job-card-container__company-name, .base-search-card__subtitle').text().trim();
    const loc     = $(this).find('.job-card-container__metadata-item, .job-search-card__location').text().trim();
    const anchor  = $(this).find('a.job-card-list__title--link, a.base-card__full-link');
    const href    = anchor.attr('href') || '';
    const jobId   = href.match(/view\\/(\\d+)/)?.[1] || '';
    if (title && company) jobs.push({ title, company, location: loc, linkedinUrl: href, jobId, source: 'linkedin' });
  });
  return jobs;
}`,
    proxyConfiguration: { useApifyProxy: true },
  };

  const searchItems = await runApifyActor(CHEERIO_ACTOR, searchInput);
  const flat: any[] = [];
  for (const item of searchItems) {
    if (Array.isArray(item)) flat.push(...item);
    else if (item?.title) flat.push(item);
  }
  const jobs = flat.slice(0, maxResults);

  if (!jobs.length) return jobs;

  // Step 2 — fetch each job detail page for company career URL + description
  const detailUrls = jobs.filter(j => j.jobId).map(j => ({ url: `https://www.linkedin.com/jobs/view/${j.jobId}/` }));
  if (!detailUrls.length) return jobs;

  const detailInput = {
    startUrls: detailUrls,
    maxRequestsPerCrawl: detailUrls.length + 2,
    pageFunction: `
async function pageFunction(context) {
  const { $, request } = context;
  let applyUrl = '';

  $('script[type="application/ld+json"]').each(function() {
    try {
      const data = JSON.parse($(this).html() || '{}');
      if (data.url && !data.url.includes('linkedin.com')) applyUrl = data.url;
      if (data.applicationContact?.url) applyUrl = data.applicationContact.url;
    } catch(e) {}
  });

  if (!applyUrl) {
    const btn = $('a.apply-button, a[data-tracking-control-name="public_jobs_apply-link-offsite"]');
    const href = btn.attr('href') || '';
    if (href && !href.includes('linkedin.com')) applyUrl = href;
  }

  if (!applyUrl) {
    const html = $.html();
    const match = html.match(/"companyApplyUrl":"([^"]+)"/);
    if (match) applyUrl = match[1].replace(/\\\\u0026/g, '&');
  }

  const description = $('.description__text, .show-more-less-html__markup').text().trim()
    || $('section.description').text().trim();
  const jobId = request.url.match(/view\\/(\\d+)/)?.[1] || '';

  return [{ jobId, applyUrl, description }];
}`,
    proxyConfiguration: { useApifyProxy: true },
  };

  let detailItems: any[] = [];
  try {
    const raw = await runApifyActor(CHEERIO_ACTOR, detailInput);
    for (const item of raw) {
      if (Array.isArray(item)) detailItems.push(...item);
      else if (item?.jobId) detailItems.push(item);
    }
  } catch {
    devWarn('[scraping] LinkedIn detail fetch failed, using LinkedIn URLs as fallback');
    return jobs;
  }

  const detailMap = new Map(detailItems.map(d => [d.jobId, d]));
  return jobs.map(job => {
    const detail = detailMap.get(job.jobId);
    return {
      ...job,
      url: detail?.applyUrl || job.linkedinUrl || '',
      linkedin_job_url: job.linkedinUrl || '',
      description: detail?.description || '',
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Poll Apify until done
// ─────────────────────────────────────────────────────────────────────────────
async function pollUntilDone(runId: string, datasetId: string): Promise<any[]> {
  const deadline = Date.now() + APIFY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const { data } = await res.json();
    const status = data?.status;
    if (status === 'SUCCEEDED') {
      const dsId = datasetId || data?.defaultDatasetId;
      const dataRes = await fetch(
        `https://api.apify.com/v2/datasets/${dsId}/items?token=${APIFY_TOKEN}&format=json&limit=500`
      );
      const items = await dataRes.json();
      return Array.isArray(items) ? items : [];
    }
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Apify run ended with status: ${status}`);
    }
  }
  throw new Error('Apify run timed out after 6 minutes');
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalize → DB schema
// ─────────────────────────────────────────────────────────────────────────────
function normalizeJob(item: any, source: string) {
  if (source === 'linkedin') {
    return {
      source: 'linkedin',
      source_job_id: String(item.jobId || item.id || ''),
      title: (item.title || '').trim(),
      company: (item.company || item.companyName || '').trim(),
      location: (item.location || '').trim(),
      url: item.url || item.linkedinUrl || item.jobUrl || '',
      jd_raw: item.description || '',
      jd_clean: stripHtml(item.description || ''),
      salary_min: item.salaryMin || null,
      salary_max: item.salaryMax || null,
      job_type: item.employmentType || null,
      remote_type: item.workplaceType || null,
    };
  }
  if (source === 'indeed') {
    return {
      source: 'indeed',
      source_job_id: String(item.id || item.positionId || item.jobkey || ''),
      title: (item.positionName || item.title || '').trim(),
      company: (item.company || item.companyName || '').trim(),
      location: (item.location || '').trim(),
      url: item.url || item.externalApplyLink || '',
      jd_raw: item.description || '',
      jd_clean: stripHtml(item.description || ''),
      salary_min: item.salaryMin || null,
      salary_max: item.salaryMax || null,
      job_type: item.jobType || null,
      remote_type: item.remote ? 'remote' : null,
    };
  }
  return null;
}

function makeHash(j: any) {
  return crypto
    .createHash('sha256')
    .update(
      [j.title, j.company, j.location, (j.jd_clean || '').slice(0, 500)]
        .map(s => (s || '').toLowerCase().trim())
        .join('|')
    )
    .digest('hex');
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — abort running scrape runs (admin only)
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();

  const { data: runningRuns } = await supabase
    .from('scrape_runs')
    .select('id, actor_id')
    .eq('status', 'running');

  let abortedCount = 0;

  for (const run of runningRuns || []) {
    await supabase.from('scrape_runs').update({
      status: 'failed',
      error_message: 'Aborted by user',
      completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    abortedCount++;
  }

  // Try to abort any active Apify runs
  if (APIFY_TOKEN) {
    try {
      const listRes = await fetch(
        `https://api.apify.com/v2/actor-runs?token=${APIFY_TOKEN}&status=RUNNING&limit=10`
      );
      if (listRes.ok) {
        const { data: { items } } = await listRes.json();
        for (const item of items || []) {
          fetch(
            `https://api.apify.com/v2/actor-runs/${item.id}/abort?token=${APIFY_TOKEN}`,
            { method: 'POST' }
          ).catch(() => {});
        }
      }
    } catch {}
  }

  return NextResponse.json({ aborted: abortedCount });
}