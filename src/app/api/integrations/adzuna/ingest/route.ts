import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/api-auth';
import { runMatchingForJobs } from '@/lib/matching';
import { isValidJobUrl } from '@/lib/job-url';
import { rateLimitResponse } from '@/lib/rate-limit';
import { apiLogger, error as logError, log as devLog } from '@/lib/logger';
import { logAuditServer } from '@/lib/audit';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

type AdzunaJob = {
  id?: string;
  adref?: string;
  title?: string;
  description?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number | null;
  salary_max?: number | null;
};

/**
 * POST /api/integrations/adzuna/ingest
 * Admin-only: fetch jobs from Adzuna and upsert into internal jobs table.
 *
 * Body:
 * {
 *   "what": "javascript developer",
 *   "where": "London",
 *   "page": 1,
 *   "results_per_page": 20,
 *   "skip_matching": false
 * }
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;
  const startedAt = Date.now();

  const rl = await rateLimitResponse(req, 'admin_heavy', authResult.user.id);
  if (rl) return rl;

  const supabase = createServiceClient();

  try {
    const body = await req.json().catch(() => ({}));
    const whatRaw = body.what ?? '';
    const titles: string[] = Array.isArray(whatRaw)
      ? (whatRaw as string[]).map((t) => String(t).trim()).filter(Boolean)
      : String(whatRaw)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
    const where: string = body.where ?? '';
    const startPage: number = Number.isFinite(body.page) && body.page > 0 ? body.page : 1;
    const resultsPerPage: number =
      Number.isFinite(body.results_per_page) && body.results_per_page > 0
        ? body.results_per_page
        : 20;
    const skipMatching: boolean = body.skip_matching ?? false;
    let pages: number =
      Number.isFinite(body.pages) && body.pages > 0
        ? body.pages
        : 1;
    // Cap to reasonable maximum to avoid runaway bulk ingest.
    pages = Math.min(pages, 100);

    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    const country = process.env.ADZUNA_COUNTRY || 'gb';

    if (!appId || !appKey) {
      return NextResponse.json(
        { error: 'ADZUNA_APP_ID or ADZUNA_APP_KEY is not configured on the server' },
        { status: 500 },
      );
    }

    let inserted = 0;
    let duplicates = 0;
    let skipped = 0;
    let skippedNoUrl = 0;
    let totalFetched = 0;
    const newJobIds: string[] = [];

    const effectiveTitles = titles.length > 0 ? titles : [''];

    for (const titleQuery of effectiveTitles) {
      for (let page = startPage; page < startPage + pages; page++) {
        const pageUrl = new URL(
          `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(
            country,
          )}/search/${encodeURIComponent(String(page))}`,
        );
        pageUrl.searchParams.set('app_id', appId);
        pageUrl.searchParams.set('app_key', appKey);
        pageUrl.searchParams.set('results_per_page', String(resultsPerPage));
        pageUrl.searchParams.set('content-type', 'application/json');
        if (titleQuery) pageUrl.searchParams.set('what', titleQuery);
        if (where) pageUrl.searchParams.set('where', where);

        const res = await fetch(pageUrl.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          const text = await res.text();
          apiLogger.error(
            {
              route: '/api/integrations/adzuna/ingest',
              user_id: authResult.user.id,
              status: res.status,
              body: text,
              page,
              what: titleQuery,
            },
            'Adzuna ingest fetch failed',
          );
          continue;
        }

        const data = (await res.json()) as { results?: AdzunaJob[] };
        const results = Array.isArray(data.results) ? data.results : [];
        if (results.length === 0) continue;
        totalFetched += results.length;

        for (const r of results) {
        const title = (r.title ?? '').trim();
        const company = (r.company?.display_name ?? '').trim();
        const location = (r.location?.display_name ?? '').trim() || null;
        const url = (r.redirect_url ?? '').trim() || null;
        const jdClean = (r.description ?? '').trim() || null;
        const salaryMin =
          typeof r.salary_min === 'number' && Number.isFinite(r.salary_min)
            ? Math.round(r.salary_min)
            : null;
        const salaryMax =
          typeof r.salary_max === 'number' && Number.isFinite(r.salary_max)
            ? Math.round(r.salary_max)
            : null;
        const sourceJobId = (r.id ?? r.adref ?? '').toString() || null;

        if (!title || !company) {
          skipped++;
          continue;
        }

        if (!url || !isValidJobUrl(url)) {
          skippedNoUrl++;
          continue;
        }

        const job = {
          source: 'adzuna',
          source_job_id: sourceJobId,
          title,
          company,
          location,
          url,
          jd_raw: jdClean,
          jd_clean: jdClean,
          salary_min: salaryMin,
          salary_max: salaryMax,
          job_type: null,
          remote_type: null,
        };

        const hash = makeHash(job);

        const { data: existing } = await supabase
          .from('jobs')
          .select('id')
          .or(
            `dedupe_hash.eq.${hash}` +
              (job.source_job_id
                ? `,and(source.eq.${job.source},source_job_id.eq.${job.source_job_id})`
                : ''),
          )
          .limit(1);

        if (existing?.length) {
          duplicates++;
          continue;
        }

        const { data: insertedRow, error } = await supabase
          .from('jobs')
          .insert({
            ...job,
            dedupe_hash: hash,
            is_active: true,
            scraped_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (!error && insertedRow?.id) {
          inserted++;
          newJobIds.push(insertedRow.id);
        } else if (error) {
          logError('[adzuna-ingest] insert error:', error.message);
        }
        }
      }
    }

    let matchingResult: any = { status: 'skipped' };
    if (!skipMatching && inserted > 0) {
      devLog(
        `[adzuna-ingest] ${inserted} new jobs inserted — running incremental title-based matching.`,
      );
      try {
        const result = await runMatchingForJobs(newJobIds, (msg) =>
          devLog('[adzuna-ingest:match] ' + msg),
        );
        matchingResult = {
          status: 'done',
          candidates_processed: result.candidates_processed,
          total_matches_upserted: result.total_matches_upserted,
        };
        devLog(
          `[adzuna-ingest] Matching complete: ${result.total_matches_upserted} new matches upserted.`,
        );
      } catch (e: any) {
        logError('[adzuna-ingest] Matching failed after ingest:', e?.message);
        matchingResult = { status: 'error', message: e?.message };
      }
    }

    try {
      await logAuditServer(
        supabase as never,
        {
          actor_id: authResult.user.id,
          actor_role: authResult.profile.effective_role,
        },
        {
          action: 'job.ingest_adzuna',
          resourceType: 'jobs',
          details: {
            inserted,
            duplicates,
            skipped,
            skipped_no_url: skippedNoUrl,
            total: totalFetched,
            matching_status: matchingResult?.status ?? 'unknown',
            search: { what: titles, where, startPage, pages, resultsPerPage, country },
          },
        },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      apiLogger.warn(
        {
          route: '/api/integrations/adzuna/ingest',
          user_id: authResult.user.id,
          err: message,
        },
        'audit log failed for adzuna ingest',
      );
    }

    apiLogger.info(
      {
        route: '/api/integrations/adzuna/ingest',
        user_id: authResult.user.id,
        inserted,
        duplicates,
        skipped,
        skipped_no_url: skippedNoUrl,
        total: totalFetched,
        duration_ms: Date.now() - startedAt,
      },
      'admin adzuna ingest completed',
    );

    return NextResponse.json({
      inserted,
      duplicates,
      skipped,
      skipped_no_url: skippedNoUrl,
      total: totalFetched,
      matching: matchingResult,
    });
  } catch (err: any) {
    apiLogger.error(
      {
        route: '/api/integrations/adzuna/ingest',
        user_id: authResult.user.id,
        err: err?.message ?? String(err),
      },
      'admin adzuna ingest failed',
    );
    const status = err instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ error: err?.message ?? 'Request failed' }, { status });
  }
}

function makeHash(j: any) {
  return crypto
    .createHash('sha256')
    .update(
      [j.title, j.company, j.location, (j.jd_clean || '').slice(0, 500)]
        .map((s: string) => (s || '').toLowerCase().trim())
        .join('|'),
    )
    .digest('hex');
}

