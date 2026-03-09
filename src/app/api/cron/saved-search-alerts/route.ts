/**
 * GET/POST /api/cron/saved-search-alerts
 * Runs saved search alerts: finds searches with alert_frequency set, runs search (new jobs since last_notified_at),
 * sends email and updates last_notified_at. Protect with CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAppUrl } from '@/config';
import { validateCronAuth } from '@/lib/security';
import { sendEmail, templateSavedSearchAlert } from '@/lib/email-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SearchParams {
  query?: string;
  location?: string;
  remote_type?: string;
  salary_min?: number;
  salary_max?: number;
  job_type?: string | string[];
  experience_level?: string | string[];
  skills?: string | string[];
  posted_after?: string;
  sort_by?: string;
}

interface SavedSearchRow {
  id: string;
  candidate_id: string;
  search_name: string;
  search_params: SearchParams;
  alert_frequency: string | null;
  last_notified_at: string | null;
}

interface JobRow {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
}

function shouldRunForFrequency(freq: string | null, lastNotified: Date | null, now: Date): boolean {
  const dailyCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weeklyCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (freq === 'instant') return true;
  if (freq === 'weekly') return !lastNotified || lastNotified < weeklyCutoff;
  // default and daily behave as daily
  return !lastNotified || lastNotified < dailyCutoff;
}

function buildJobsQuery(
  supabase: ReturnType<typeof createServiceClient>,
  params: SearchParams,
  postedAfter?: string
) {
  const p = params;
  const query = typeof p.query === 'string' ? p.query.trim() : '';
  const location = typeof p.location === 'string' ? p.location.trim() : '';
  const remoteType = typeof p.remote_type === 'string' ? p.remote_type : '';
  const jobTypes = Array.isArray(p.job_type)
    ? p.job_type
    : typeof p.job_type === 'string'
      ? p.job_type.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const experienceLevels = Array.isArray(p.experience_level)
    ? p.experience_level
    : typeof p.experience_level === 'string'
      ? p.experience_level.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const skills = Array.isArray(p.skills)
    ? p.skills
    : typeof p.skills === 'string'
      ? p.skills.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  let q = supabase
    .from('jobs')
    .select('id, title, company, location, url, scraped_at')
    .eq('is_active', true);

  if (query) {
    const pattern = `%${query.replace(/%/g, '\\%')}%`;
    q = q.or(`title.ilike.${pattern},company.ilike.${pattern}`);
  }
  if (location) q = q.ilike('location', `%${location}%`);
  if (remoteType && ['remote', 'hybrid', 'onsite'].includes(remoteType.toLowerCase())) {
    q = q.eq('remote_type', remoteType.toLowerCase());
  }
  if (p.salary_min != null) {
    const n = Number(p.salary_min);
    if (!Number.isNaN(n)) q = q.or(`salary_max.gte.${n},salary_max.is.null`);
  }
  if (p.salary_max != null) {
    const n = Number(p.salary_max);
    if (!Number.isNaN(n)) q = q.lte('salary_min', n);
  }
  if (jobTypes.length > 0) q = q.in('job_type', jobTypes);
  if (experienceLevels.length > 0) q = q.in('seniority_level', experienceLevels);
  if (skills.length > 0) q = q.overlaps('must_have_skills', skills);
  if (postedAfter) {
    const d = new Date(postedAfter);
    if (!Number.isNaN(d.getTime())) q = q.gte('scraped_at', d.toISOString());
  }

  q = q.order('scraped_at', { ascending: false }).limit(15);
  return q;
}

export async function GET(req: NextRequest) {
  return runAlerts(req);
}

export async function POST(req: NextRequest) {
  return runAlerts(req);
}

async function runAlerts(req: NextRequest) {
  if (!validateCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const appUrl = getAppUrl();
  const jobsBaseUrl = appUrl ? `${appUrl}/dashboard/candidate/jobs` : '#';

  const { data: searches, error: fetchErr } = await supabase
    .from('candidate_saved_searches')
    .select('id, candidate_id, search_name, search_params, alert_frequency, last_notified_at')
    .eq('is_active', true)
    .not('alert_frequency', 'is', null);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const now = new Date();

  const results: { searchId: string; email: string; sent: boolean; jobCount: number; error?: string }[] = [];

  for (const row of (searches ?? []) as SavedSearchRow[]) {
    const lastNotified = row.last_notified_at ? new Date(row.last_notified_at) : null;
    const shouldRun = shouldRunForFrequency(row.alert_frequency, lastNotified, now);

    if (!shouldRun) continue;

    const { data: candidate } = await supabase
      .from('candidates')
      .select('user_id')
      .eq('id', row.candidate_id)
      .single();

    if (!candidate?.user_id) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('id', candidate.user_id)
      .single();

    const email = profile?.email?.trim();
    if (!email) continue;

    const params = row.search_params || {};
    const postedAfter = lastNotified ? lastNotified.toISOString() : undefined;
    const query = buildJobsQuery(supabase, params, postedAfter);
    const { data: jobs, error: jobsErr } = await query;

    if (jobsErr) {
      results.push({ searchId: row.id, email, sent: false, jobCount: 0, error: jobsErr.message });
      continue;
    }

    const jobList = (jobs ?? []) as JobRow[];
    if (jobList.length === 0) {
      results.push({ searchId: row.id, email, sent: false, jobCount: 0 });
      continue;
    }

    // In-app channel dedupe: create per-job events (only if not already sent).
    const jobIds = jobList.map((j) => j.id);
    const { data: inAppDelivered } = await supabase
      .from('candidate_job_alert_events')
      .select('job_id')
      .eq('saved_search_id', row.id)
      .eq('channel', 'in_app')
      .eq('delivery_status', 'sent')
      .in('job_id', jobIds);
    const deliveredInAppSet = new Set((inAppDelivered ?? []).map((x: { job_id: string }) => x.job_id));
    const inAppRows = jobList
      .filter((j) => !deliveredInAppSet.has(j.id))
      .map((j) => ({
        saved_search_id: row.id,
        candidate_id: row.candidate_id,
        job_id: j.id,
        channel: 'in_app' as const,
        delivery_status: 'sent' as const,
        delivered_at: now.toISOString(),
        payload: {
          search_name: row.search_name,
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
        },
      }));
    if (inAppRows.length > 0) {
      await supabase.from('candidate_job_alert_events').upsert(inAppRows, {
        onConflict: 'saved_search_id,job_id,channel',
      });
    }

    // Email channel dedupe: only send jobs that have not been sent for this search.
    const { data: emailDelivered } = await supabase
      .from('candidate_job_alert_events')
      .select('job_id')
      .eq('saved_search_id', row.id)
      .eq('channel', 'email')
      .eq('delivery_status', 'sent')
      .in('job_id', jobIds);
    const deliveredEmailSet = new Set((emailDelivered ?? []).map((x: { job_id: string }) => x.job_id));
    const jobsForEmail = jobList.filter((j) => !deliveredEmailSet.has(j.id));

    if (jobsForEmail.length === 0) {
      await supabase
        .from('candidate_saved_searches')
        .update({ last_notified_at: now.toISOString() })
        .eq('id', row.id);
      results.push({ searchId: row.id, email, sent: false, jobCount: 0 });
      continue;
    }

    const { subject, html } = templateSavedSearchAlert({
      candidateName: profile?.name || undefined,
      searchName: row.search_name,
      jobs: jobsForEmail.map((j) => ({
        title: j.title || 'Untitled',
        company: j.company ?? undefined,
        location: j.location ?? undefined,
        url: j.url ?? undefined,
      })),
      jobsUrl: jobsBaseUrl,
    });

    const sendResult = await sendEmail({ to: email, subject, html });
    if (sendResult.error) {
      const failedRows = jobsForEmail.map((j) => ({
        saved_search_id: row.id,
        candidate_id: row.candidate_id,
        job_id: j.id,
        channel: 'email' as const,
        delivery_status: 'failed' as const,
        error_message: sendResult.error,
        payload: {
          search_name: row.search_name,
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
        },
      }));
      await supabase.from('candidate_job_alert_events').upsert(failedRows, {
        onConflict: 'saved_search_id,job_id,channel',
      });
      results.push({ searchId: row.id, email, sent: false, jobCount: jobsForEmail.length, error: sendResult.error });
      continue;
    }

    const sentRows = jobsForEmail.map((j) => ({
      saved_search_id: row.id,
      candidate_id: row.candidate_id,
      job_id: j.id,
      channel: 'email' as const,
      delivery_status: 'sent' as const,
      delivered_at: now.toISOString(),
      error_message: null,
      payload: {
        search_name: row.search_name,
        title: j.title,
        company: j.company,
        location: j.location,
        url: j.url,
      },
    }));
    await supabase.from('candidate_job_alert_events').upsert(sentRows, {
      onConflict: 'saved_search_id,job_id,channel',
    });

    await supabase
      .from('candidate_saved_searches')
      .update({ last_notified_at: now.toISOString() })
      .eq('id', row.id);

    results.push({ searchId: row.id, email, sent: true, jobCount: jobsForEmail.length });
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    sent: results.filter((r) => r.sent).length,
    results,
  });
}
