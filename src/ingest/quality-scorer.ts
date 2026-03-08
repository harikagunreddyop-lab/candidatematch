/**
 * Job quality scoring for ingestion pipeline.
 * Scores 0-100 with breakdown (completeness, clarity, professionalism, specificity, legitimacy).
 */

import type { CanonicalJob } from './adapters';

/** Input for scoring: CanonicalJob uses description_text and source_org; we treat as jd_raw and company. */
export type JobForQuality = Pick<
  CanonicalJob,
  'title' | 'description_text' | 'location_raw' | 'source_org' | 'department'
> & {
  company?: string | null;
  jd_raw?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  remote_type?: string | null;
};

export interface QualityScore {
  overall: number;
  breakdown: {
    completeness: number;
    clarity: number;
    professionalism: number;
    specificity: number;
    legitimacy: number;
  };
  flags: string[];
}

function jd(job: JobForQuality): string {
  return (job.jd_raw ?? job.description_text ?? '').trim();
}

function company(job: JobForQuality): string {
  return (job.company ?? job.source_org ?? '').trim();
}

function scoreCompleteness(job: JobForQuality): number {
  let score = 0;
  const requiredFields: (keyof JobForQuality)[] = ['title', 'source_org', 'description_text', 'location_raw'];
  const optionalFields: (keyof JobForQuality)[] = ['salary_min', 'salary_max', 'remote_type', 'department'];

  const has = (k: keyof JobForQuality): boolean => {
    const v = job[k];
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 3;
    if (typeof v === 'number') return true;
    return false;
  };

  requiredFields.forEach((field) => {
    if (has(field)) score += 70 / requiredFields.length;
  });

  optionalFields.forEach((field) => {
    if (has(field)) score += 30 / optionalFields.length;
  });

  return Math.min(score, 100);
}

function scoreClarity(job: JobForQuality): number {
  const jdText = jd(job);
  let score = 100;

  if (jdText.length < 200) score -= 30;
  else if (jdText.length < 500) score -= 15;

  const capsRatio = (jdText.match(/[A-Z]/g) || []).length / (jdText.length || 1);
  if (capsRatio > 0.3) score -= 20;

  const punctRatio = (jdText.match(/[!?]{2,}/g) || []).length;
  if (punctRatio > 3) score -= 15;

  if (jdText.includes('•') || jdText.includes('- ')) score += 10;
  if (jdText.includes('Requirements') || jdText.includes('Responsibilities')) score += 10;

  return Math.max(Math.min(score, 100), 0);
}

function scoreProfessionalism(job: JobForQuality): number {
  const jdText = jd(job).toLowerCase();
  let score = 100;

  const spamKeywords = [
    'make money fast',
    'work from home',
    'no experience',
    'earn $$$',
    'guaranteed income',
    'mlm',
    'crypto',
    'investment opportunity',
    'be your own boss',
  ];

  spamKeywords.forEach((keyword) => {
    if (jdText.includes(keyword)) score -= 20;
  });

  if ((jdText.match(/\$/g) || []).length > 10) score -= 15;
  if (jdText.includes('!!') || jdText.includes('???')) score -= 10;

  return Math.max(score, 0);
}

function scoreSpecificity(job: JobForQuality): number {
  const jdText = jd(job);
  let score = 50;

  if (/\d+ years? (of )?experience/i.test(jdText)) score += 15;
  if (/bachelor|master|phd/i.test(jdText)) score += 10;
  if (/\$\d{2,3},?\d{3}/g.test(jdText)) score += 10;
  if (job.salary_min != null && job.salary_max != null) score += 15;

  const techKeywords = ['python', 'javascript', 'react', 'sql', 'aws', 'kubernetes'];
  techKeywords.forEach((tech) => {
    if (jdText.toLowerCase().includes(tech)) score += 2;
  });

  return Math.min(score, 100);
}

function scoreLegitimacy(job: JobForQuality): number {
  let score = 100;
  const jdText = jd(job).toLowerCase();
  const companyName = company(job);
  const title = (job.title || '').trim();

  const redFlags = [
    'pay upfront',
    'send money',
    'wire transfer',
    'bitcoin',
    'social security',
    'credit card',
    'bank account',
    'personal information',
    'fee required',
    'investment required',
  ];

  redFlags.forEach((flag) => {
    if (jdText.includes(flag)) score -= 25;
  });

  if (!companyName || companyName.length < 3) score -= 20;
  if (companyName && /\d{5,}/.test(companyName)) score -= 15;
  if (!title || title.length < 5) score -= 15;
  if (title && title.length > 100) score -= 10;

  return Math.max(score, 0);
}

function identifyFlags(
  _job: JobForQuality,
  scores: QualityScore['breakdown']
): string[] {
  const flags: string[] = [];
  if (scores.completeness < 50) flags.push('INCOMPLETE_DATA');
  if (scores.clarity < 40) flags.push('POOR_CLARITY');
  if (scores.professionalism < 40) flags.push('UNPROFESSIONAL');
  if (scores.specificity < 30) flags.push('TOO_VAGUE');
  if (scores.legitimacy < 50) flags.push('SUSPICIOUS');
  return flags;
}

/**
 * Score a job for quality (0-100) with breakdown and flags.
 * Accepts CanonicalJob; uses description_text as JD and source_org as company when not provided.
 */
export async function scoreJobQuality(job: JobForQuality): Promise<QualityScore> {
  const breakdown = {
    completeness: scoreCompleteness(job),
    clarity: scoreClarity(job),
    professionalism: scoreProfessionalism(job),
    specificity: scoreSpecificity(job),
    legitimacy: scoreLegitimacy(job),
  };

  const sum = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const overall = Math.round((sum / 5) * 10) / 10;
  const flags = identifyFlags(job, breakdown);

  return { overall, breakdown, flags };
}
