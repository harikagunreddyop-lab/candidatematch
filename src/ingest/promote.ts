/**
 * Auto-promote ingest_jobs into the main jobs table for matching and candidate visibility.
 */

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { error as logError } from '@/lib/logger';

type IngestJob = {
  id: string;
  provider: string;
  source_org: string;
  source_job_id: string;
  title: string;
  location_raw: string | null;
  department: string | null;
  job_url: string | null;
  apply_url: string;
  description_text: string;
  description_html: string | null;
  last_seen_at: string | null;
};

function makeDedupeHash(ij: IngestJob): string {
  return crypto
    .createHash('sha256')
    .update(
      [ij.title, ij.source_org, ij.location_raw || '', (ij.description_text || '').slice(0, 500)]
        .map((s) => (s || '').toLowerCase().trim())
        .join('|')
    )
    .digest('hex');
}

function toJobsRow(ij: IngestJob, dedupeHash: string): Record<string, unknown> {
  return {
    source: ij.provider,
    source_job_id: ij.source_job_id,
    title: ij.title,
    company: ij.source_org,
    location: ij.location_raw ?? null,
    url: ij.job_url ?? ij.apply_url,
    jd_raw: ij.description_html ?? ij.description_text,
    jd_clean: ij.description_text,
    dedupe_hash: dedupeHash,
    is_active: true,
    scraped_at: new Date().toISOString(),
    last_seen_at: ij.last_seen_at ?? new Date().toISOString(),
    ingest_job_id: ij.id,
  };
}

/**
 * Promote open ingest_jobs into the jobs table. Upserts by ingest_job_id or (source, source_job_id).
 * Returns IDs of jobs that were newly created (for precomputeJobRequirements).
 */
export async function promoteIngestJobs(
  supabase: SupabaseClient,
  ingestJobIds: string[]
): Promise<{ promoted: number; newJobIds: string[] }> {
  if (ingestJobIds.length === 0) {
    return { promoted: 0, newJobIds: [] };
  }

  const { data: rows, error: fetchErr } = await supabase
    .from('ingest_jobs')
    .select('id, provider, source_org, source_job_id, title, location_raw, department, job_url, apply_url, description_text, description_html, last_seen_at')
    .in('id', ingestJobIds)
    .eq('status', 'open');

  if (fetchErr || !rows?.length) {
    if (fetchErr) logError('[PROMOTE] fetch ingest_jobs failed:', fetchErr.message);
    return { promoted: 0, newJobIds: [] };
  }

  const ingestJobs = rows as IngestJob[];
  let promoted = 0;
  const newJobIds: string[] = [];

  for (const ij of ingestJobs) {
    const dedupeHash = makeDedupeHash(ij);
    const jobRow = toJobsRow(ij, dedupeHash);

    // 1. Already promoted (has ingest_job_id link)
    const { data: byIngest } = await supabase
      .from('jobs')
      .select('id')
      .eq('ingest_job_id', ij.id)
      .limit(1)
      .maybeSingle();

    if (byIngest?.id) {
      const { error: updErr } = await supabase
        .from('jobs')
        .update({
          title: jobRow.title,
          location: jobRow.location,
          url: jobRow.url,
          jd_raw: jobRow.jd_raw,
          jd_clean: jobRow.jd_clean,
          last_seen_at: jobRow.last_seen_at,
        })
        .eq('id', byIngest.id);
      if (!updErr) promoted++;
      continue;
    }

    // 2. Exists by (source, source_job_id) from earlier promote
    const { data: bySource } = await supabase
      .from('jobs')
      .select('id')
      .eq('source', ij.provider)
      .eq('source_job_id', ij.source_job_id)
      .limit(1)
      .maybeSingle();

    if (bySource?.id) {
      const { error: updErr } = await supabase
        .from('jobs')
        .update({
          ...jobRow,
          ingest_job_id: ij.id,
        })
        .eq('id', bySource.id);
      if (!updErr) promoted++;
      continue;
    }

    // 3. Dedupe by hash (avoid dupes with manual/linkedin jobs)
    const { data: byHash } = await supabase
      .from('jobs')
      .select('id')
      .eq('dedupe_hash', dedupeHash)
      .limit(1)
      .maybeSingle();

    if (byHash?.id) {
      const { error: updErr } = await supabase
        .from('jobs')
        .update({
          ingest_job_id: ij.id,
          source: ij.provider,
          source_job_id: ij.source_job_id,
          last_seen_at: jobRow.last_seen_at,
        })
        .eq('id', byHash.id);
      if (!updErr) promoted++;
      continue;
    }

    // 4. Insert new
    const { data: inserted, error: insErr } = await supabase
      .from('jobs')
      .insert(jobRow)
      .select('id')
      .single();

    if (!insErr && inserted?.id) {
      promoted++;
      newJobIds.push(inserted.id);
    } else if (insErr) {
      logError('[PROMOTE] insert job failed:', insErr.message, 'provider=', ij.provider, 'source_org=', ij.source_org);
    }
  }

  return { promoted, newJobIds };
}

/**
 * Mark jobs as inactive when their source ingest_jobs were closed.
 */
export async function deactivateClosedJobs(
  supabase: SupabaseClient,
  ingestJobIds: string[]
): Promise<number> {
  if (ingestJobIds.length === 0) return 0;

  const { data, error } = await supabase
    .from('jobs')
    .update({ is_active: false })
    .in('ingest_job_id', ingestJobIds)
    .select('id');

  if (error) return 0;
  return data?.length ?? 0;
}
