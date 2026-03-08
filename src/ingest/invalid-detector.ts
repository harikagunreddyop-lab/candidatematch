/**
 * Invalid job detection: missing fields, malformed data, suspicious content.
 */

import type { JobForQuality } from './quality-scorer';

export interface InvalidResult {
  valid: boolean;
  reason?: string;
}

export function isInvalidJob(job: JobForQuality): InvalidResult {
  const title = (job.title || '').trim();
  const company = (job.company ?? job.source_org ?? '').trim();
  const jdRaw = (job.jd_raw ?? job.description_text ?? '').trim();

  if (!title || title.length < 5) {
    return { valid: false, reason: 'Title missing or too short' };
  }

  if (!company || company.length < 2) {
    return { valid: false, reason: 'Company missing' };
  }

  if (!jdRaw || jdRaw.length < 100) {
    return { valid: false, reason: 'Job description too short' };
  }

  if (title.length > 200) {
    return { valid: false, reason: 'Title too long' };
  }

  if (
    job.salary_min != null &&
    job.salary_max != null &&
    job.salary_min > job.salary_max
  ) {
    return { valid: false, reason: 'Invalid salary range' };
  }

  const jd = jdRaw.toLowerCase();
  if (jd.includes('<script>') || jd.includes('javascript:')) {
    return { valid: false, reason: 'Contains script tags' };
  }

  return { valid: true };
}
