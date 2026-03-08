/**
 * Spam detection for job ingestion.
 * Pattern-based and quality-threshold based rejection.
 */

import type { JobForQuality, QualityScore } from './quality-scorer';

export function isSpam(job: JobForQuality, qualityScore: QualityScore): boolean {
  if (qualityScore.overall < 30) return true;
  if (qualityScore.breakdown.legitimacy < 40) return true;

  const jd = ((job.jd_raw ?? job.description_text) || '').toLowerCase();
  const title = (job.title || '').toLowerCase();

  const spamPatterns = [
    /make \$\d+k? per (week|month|day)/i,
    /work from home.{0,50}no experience/i,
    /mlm|multi-level marketing|pyramid scheme/i,
    /bitcoin|cryptocurrency.{0,30}investment/i,
    /send (money|payment|fee)/i,
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(jd)) return true;
  }

  if (/free|easy money|work from home|make money/i.test(title)) return true;

  return false;
}
