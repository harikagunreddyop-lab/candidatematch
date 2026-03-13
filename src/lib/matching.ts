import { createServiceClient } from '@/lib/supabase-server';
import { log as devLog, error as logError } from '@/lib/logger';
import { upsertJobSkillIndex } from '@/lib/skill-index';

const DEFAULT_MAX_MATCHES_PER_CANDIDATE = 500;

// ── ATS result cache ─────────────────────────────────────────────────────────
// Before re-running expensive PDF extraction + LLM scoring, look up the
// scoring_runs table for a row matching the same inputs hash.
// Cache key: (candidate_id, job_id, model_version, inputs_hash)
// inputs_hash is computed from: resume_id|resume_version_id + jd_length + model_version.
// If found, return the cached result immediately — no LLM calls needed.
// ATS Engine v3: scoring now handled via the dedicated ATS API and engine in src/lib/ats/.

// ── Feature flag helpers ─────────────────────────────────────────────────────
// We inline a lightweight synchronous check here to avoid circular deps.
// For flags not in the DB yet (older deploys), defaults to false (safe).
async function isFlagEnabled(supabase: any, key: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('feature_flags')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (!data) return false;
    const v = data.value;
    if (typeof v === 'boolean') return v;
    if (v === true || v === 'true' || v === '"true"') return true;
    return false;
  } catch {
    return false; // If flag table missing, default OFF
  }
}

async function getIntFlagOrDefault(supabase: any, key: string, defaultValue: number): Promise<number> {
  try {
    const { data } = await supabase
      .from('feature_flags')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (!data) return defaultValue;
    const v = data.value;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const cleaned = v.replace(/"/g, '');
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : defaultValue;
    }
    if (v && typeof v === 'object' && 'value' in v && typeof (v as any).value === 'number') {
      return (v as any).value;
    }
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function isMatchingV3Enabled(supabase: any): Promise<boolean> {
  return isFlagEnabled(supabase, 'matching.v3.enabled');
}

export async function computeSkillOverlapScores(
  supabase: any,
  candidateId: string,
  jobs: Job[],
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  if (!jobs.length) return scores;

  const { data: candRows } = await supabase
    .from('candidate_skill_index')
    .select('skill, weight')
    .eq('candidate_id', candidateId);
  if (!candRows?.length) return scores;

  const candidateWeights = new Map<string, number>();
  for (const row of candRows as { skill: string; weight: number }[]) {
    candidateWeights.set(row.skill, Number(row.weight) || 0);
  }
  if (!candidateWeights.size) return scores;

  const jobIds = jobs.map(j => j.id);
  const { data: jobRows } = await supabase
    .from('job_skill_index')
    .select('job_id, skill, weight')
    .in('job_id', jobIds);
  if (!jobRows?.length) return scores;

  const byJob = new Map<string, Array<{ skill: string; weight: number }>>();
  for (const row of jobRows as { job_id: string; skill: string; weight: number }[]) {
    if (!byJob.has(row.job_id)) byJob.set(row.job_id, []);
    byJob.get(row.job_id)!.push({ skill: row.skill, weight: Number(row.weight) || 0 });
  }

  for (const job of jobs) {
    const jSkills = byJob.get(job.id);
    if (!jSkills || !jSkills.length) continue;
    let overlap = 0;
    let jobTotal = 0;
    for (const js of jSkills) {
      jobTotal += js.weight;
      const cw = candidateWeights.get(js.skill);
      if (cw && cw > 0) {
        overlap += Math.min(cw, js.weight);
      }
    }
    if (jobTotal > 0 && overlap > 0) {
      const score = overlap / jobTotal;
      scores.set(job.id, score);
    }
  }

  return scores;
}

async function runInBatches<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

type Job = {
  id: string;
  title: string;
  company: string;
  location?: string;
  jd_clean?: string;
  jd_raw?: string;
  salary_min?: number;
  salary_max?: number;
  structured_requirements?: any;
  must_have_skills?: string[];
  nice_to_have_skills?: string[];
  seniority_level?: string;
  min_years_experience?: number;
};

type Candidate = {
  id: string;
  full_name: string;
  primary_title?: string;
  secondary_titles?: string[];
  target_job_titles?: string[];
  skills?: any;
  tools?: string[];
  soft_skills?: string[];
  experience?: any;
  education?: any;
  certifications?: any;
  location?: string;
  visa_status?: string;
  years_of_experience?: number;
  open_to_remote?: boolean;
  open_to_relocation?: boolean;
  target_locations?: string[];
  parsed_resume_text?: string;
  active: boolean;
};


// ── Domain classification ────────────────────────────────────────────────────

type Domain =
  | 'data-engineering' | 'data-science' | 'data-analytics' | 'bi'
  | 'devops' | 'fullstack' | 'frontend' | 'mobile' | 'qa' | 'security'
  | 'management' | 'design' | 'software-engineering'
  | 'product' | 'finance-analyst' | 'general';

// Domains that can match each other. Non-symmetric by design so a Java Developer
// never matches an Analyst role and vice-versa.
const DOMAIN_COMPATIBILITY: Record<Domain, Domain[]> = {
  'software-engineering': ['software-engineering', 'fullstack', 'frontend'],
  'frontend': ['frontend', 'fullstack', 'software-engineering', 'mobile'],
  'fullstack': ['fullstack', 'frontend', 'software-engineering', 'mobile'],
  'data-engineering': ['data-engineering', 'data-science'],
  'data-science': ['data-science', 'data-engineering'],
  'data-analytics': ['data-analytics', 'data-science', 'bi'],
  'bi': ['bi', 'data-analytics'],
  'devops': ['devops', 'software-engineering'],
  'mobile': ['mobile', 'frontend', 'fullstack', 'software-engineering'],
  'qa': ['qa'],
  'security': ['security'],
  'management': ['management', 'product'],
  'design': ['design', 'frontend'],
  'product': ['product', 'management'],
  'finance-analyst': ['finance-analyst', 'data-analytics'],
  'general': ['general'],
};

function classifyDomain(title: string): Domain {
  const t = (title || '').toLowerCase().trim();
  if (!t) return 'general';

  // Data Engineering — must come before generic "data" checks
  if (/data\s*(engineer|architect|platform|infrastructure|pipeline|warehouse)|etl\s*(dev|eng)|big\s*data/i.test(t)) return 'data-engineering';

  // Data Science / ML
  if (/data\s*scien|machine\s*learn|\bml\s*(eng|dev|scientist)|\bai\s*(eng|dev)|deep\s*learn|\bnlp\b|computer\s*vision|research\s*scien/i.test(t)) return 'data-science';

  // BI / Reporting
  if (/\bpow(er)?\s*bi\b|\btableau\b|\blooker\b|bi\s*(dev|analyst|engineer|spec)|business\s*intel/i.test(t)) return 'bi';

  // ── Specific domains MUST come BEFORE the data-analytics catch-all ────────
  // Otherwise "QA Analyst", "Security Analyst", "Financial Analyst" etc. are
  // all swallowed by the bare |analyst alternation in data-analytics.

  // QA — expanded to catch "Quality Analyst", "Quality Systems", etc.
  if (/\bqa\b|quality\s*(assur|engineer|analyst|systems|control)|test\s*(auto|eng)|\bsdet\b|\bsoftware\s*tester\b/i.test(t)) return 'qa';

  // Security
  if (/secur|cyber|infosec|penetration/i.test(t)) return 'security';

  // Finance / investment analyst
  if (/financ(ial)?\s*anal|investment\s*anal|credit\s*anal|equity\s*anal|risk\s*anal/i.test(t)) return 'finance-analyst';

  // Data Analytics / Business Analyst — catch-all "analyst" is now safe because
  // QA, security, and finance have already been handled above.
  if (/data\s*anal|business\s*anal|operations?\s*anal|marketing\s*anal|product\s*anal|\banalyst\b/i.test(t)) return 'data-analytics';

  // Product Management
  if (/product\s*manag|program\s*manag|project\s*manag|engineering\s*manag|\bscrum\b|\bpmo\b/i.test(t)) return 'management';

  // Product roles that aren't PMs
  if (/\bproduct\s*(owner|lead|strategist)\b/i.test(t)) return 'product';

  // DevOps / SRE / Cloud
  if (/devops|\bsre\b|site\s*reliab|cloud\s*(eng|arch)|platform\s*eng/i.test(t)) return 'devops';

  // Fullstack
  if (/full[\s-]*stack/i.test(t)) return 'fullstack';

  // Mobile
  if (/\bios\s*(dev|eng)|android\s*(dev|eng)|mobile\s*(dev|eng)|react\s*native|flutter/i.test(t)) return 'mobile';

  // Frontend
  if (/front[\s-]*end|ui\s*(dev|eng)|react\s*(dev|eng)|angular\s*(dev|eng)|vue\s*(dev|eng)/i.test(t)) return 'frontend';

  // Design
  if (/\bux\b|ui\s*design|product\s*design/i.test(t)) return 'design';

  // Software Engineering (must be last to not swallow analysts, etc.)
  if (/software|developer|programmer|back[\s-]*end|java(?!script)|python|\.net|c#|ruby|php|\bnode\b|spring|golang|\bgo\b/i.test(t)) return 'software-engineering';

  return 'general';
}

function getCandidateDomains(candidate: Candidate): Domain[] {
  const domains = new Set<Domain>();
  domains.add(classifyDomain(candidate.primary_title || ''));
  for (const t of candidate.secondary_titles || []) domains.add(classifyDomain(t));
  for (const t of candidate.target_job_titles || []) domains.add(classifyDomain(t));
  return Array.from(domains);
}

function isDomainCompatible(candidateDomains: Domain[], jobDomain: Domain): boolean {
  return candidateDomains.some(cd => {
    if (cd === jobDomain) return true;
    const compatible = DOMAIN_COMPATIBILITY[cd] || [];
    return compatible.includes(jobDomain);
  });
}

// ── Skill parsing ────────────────────────────────────────────────────────────

// parseSkills/parseArray and ATS-specific helpers were removed in ATS Engine v3.

function canonicalTerm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9#+.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Simple title & skill scoring (titles + skills only) ────────────────────────

function simpleTokenSet(str: string): Set<string> {
  return new Set(
    canonicalTerm(str)
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

function simpleTitleScore(candidate: Candidate, job: Job): number {
  const titles: string[] = [];
  if (candidate.primary_title) titles.push(candidate.primary_title);
  if (Array.isArray(candidate.target_job_titles)) titles.push(...candidate.target_job_titles);
  if (!titles.length || !job.title) return 0;

  const jobTokens = simpleTokenSet(job.title);
  if (!jobTokens.size) return 0;

  const candTokens = new Set<string>();
  for (const t of titles) {
    for (const tok of simpleTokenSet(t)) candTokens.add(tok);
  }

  let overlap = 0;
  for (const tok of jobTokens) {
    if (candTokens.has(tok)) overlap++;
  }
  return (overlap / jobTokens.size) * 100;
}

function simpleSkillsScore(candidate: Candidate, job: Job): number {
  const candSkills = Array.isArray(candidate.skills) ? candidate.skills : [];
  const jobSkills = [
    ...(Array.isArray(job.must_have_skills) ? job.must_have_skills : []),
    ...(Array.isArray(job.nice_to_have_skills) ? job.nice_to_have_skills : []),
  ];
  if (!candSkills.length || !jobSkills.length) return 0;

  const candSet = new Set(candSkills.map((s) => canonicalTerm(String(s))));
  const jobSet = new Set(jobSkills.map((s) => canonicalTerm(String(s))));

  let overlap = 0;
  for (const s of jobSet) {
    if (candSet.has(s)) overlap++;
  }
  return (overlap / jobSet.size) * 100;
}


// ── Resume extraction ────────────────────────────────────────────────────────
// Delegated to resume-pdf-text.ts so unpdf is not in the /api/matches bundle path.

// getResumeTextFromStorage was used only by legacy ATS scoring; no longer needed.


// ── JD Requirements: extract once & cache ────────────────────────────────────

async function getOrExtractRequirements(
  supabase: any,
  job: Job,
): Promise<{
  must_have_skills: string[];
  nice_to_have_skills: string[];
  implicit_skills: string[];
  min_years_experience: number | null;
  preferred_years_experience: number | null;
  seniority_level: string | null;
  required_education: string | null;
  preferred_education_fields: string[];
  certifications: string[];
  location_type: string | null;
  location_city: string | null;
  visa_sponsorship: string | null;
  domain: Domain;
  industry_vertical: string | null;
  behavioral_keywords: string[];
  context_phrases: string[];
  responsibilities: string[];
} | null> {
  if (job.structured_requirements && typeof job.structured_requirements === 'object' && (job as any).structured_requirements.must_have_skills) {
    const cached = job.structured_requirements as any;
    return { ...cached, responsibilities: cached.responsibilities ?? [] };
  }

  const jd = (job.jd_clean || job.jd_raw || '').trim();
  const minimal = {
    must_have_skills: [],
    nice_to_have_skills: [],
    implicit_skills: [],
    min_years_experience: null,
    preferred_years_experience: null,
    seniority_level: null,
    required_education: null,
    preferred_education_fields: [],
    certifications: [],
    location_type: null,
    location_city: null,
    visa_sponsorship: null,
    domain: classifyDomain(job.title),
    industry_vertical: null,
    behavioral_keywords: [],
    context_phrases: [],
    responsibilities: [],
  };

  // Avoid re-attempting extraction forever for jobs with missing/too-short JDs.
  if (!jd || jd.length < 50) {
    await supabase.from('jobs').update({
      structured_requirements: minimal,
      must_have_skills: minimal.must_have_skills,
      nice_to_have_skills: minimal.nice_to_have_skills,
      seniority_level: minimal.seniority_level,
      min_years_experience: minimal.min_years_experience,
    }).eq('id', job.id);
    // Keep job_skill_index roughly in sync even for minimal requirements
    await upsertJobSkillIndex(job.id, minimal);
    return minimal;
  }

  // TODO: ATS scoring replaced — rewire requirement extraction to new engine at src/lib/ats/
  const reqs = null;
  const finalReqs = reqs || minimal;

  // Cache on the job record for future runs
  await supabase.from('jobs').update({
    structured_requirements: finalReqs,
    must_have_skills: finalReqs.must_have_skills,
    nice_to_have_skills: finalReqs.nice_to_have_skills,
    seniority_level: finalReqs.seniority_level,
    min_years_experience: finalReqs.min_years_experience,
  }).eq('id', job.id);

  // Refresh job_skill_index snapshot
  await upsertJobSkillIndex(job.id, finalReqs);

  return finalReqs;
}

// Precompute requirements for a set of jobs (used at ingest time so matching runs stay fast).
export async function precomputeJobRequirements(supabase: any, jobIds: string[]): Promise<void> {
  if (!jobIds.length) return;
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, title, company, location, jd_clean, jd_raw, structured_requirements, must_have_skills, nice_to_have_skills, seniority_level, min_years_experience')
    .in('id', jobIds);
  if (error || !jobs?.length) return;
  await runInBatches(jobs as Job[], 5, async (job) => {
    try {
      await getOrExtractRequirements(supabase, job);
    } catch (e) {
      logError('[matching] precomputeJobRequirements failed for job ' + job.id, e);
    }
  });
}



// ── Title-based matching (no score, no LLM) ──────────────────────────────────

const KEEP_SHORT = new Set(['qa', 'ai', 'ml', 'bi', 'ux', 'pm', 'vp', 'cto', 'ceo', 'cfo', 'sre']);

function titleTokens(title: string): string[] {
  const clean = canonicalTerm(title);
  return Array.from(new Set(clean.split(/\s+/).filter(t => t.length >= 3 || KEEP_SHORT.has(t))));
}

/**
 * Generic seniority/role words that appear in many unrelated titles and must NOT
 * be used as matching signals on their own (e.g. "data" in "Data Engineer" vs
 * "Data Analyst", "engineer" in "Software Engineer" vs "QA Engineer").
 *
 * NOTE: "analyst", "data", "product", "business", "technical", "solutions" are
 * intentionally listed here because they appear across completely different roles.
 * Matching is done at the DOMAIN level for these cases.
 */
const TRIVIAL_TOKENS = new Set([
  // Seniority / level
  'senior', 'junior', 'lead', 'staff', 'principal', 'associate', 'head',
  'director', 'manager', 'specialist', 'consultant', 'advisor',
  // Generic role words that span many domains
  'engineer', 'developer', 'programmer',
  'analyst',      // Java dev must NOT match "Analyst" roles via this token
  'data',         // "Data Engineer" must NOT match "Data Analyst" via this token
  'product',      // "Product Manager" must NOT match "Product Analyst"
  'business',     // "Business Analyst" ≠ "Business Development Manager"
  'technical',
  'solutions',
  'digital',
  'operations',
  'platform',
  'cloud',        // "Cloud Engineer" vs "Cloud Architect" – different sub-roles
  'application',
  'systems',
  'information',
  'technology',
]);

// ── Title/domain compatibility helper ──────────────────────────────────────────

function hasQaToken(title: string): boolean {
  const t = canonicalTerm(title);
  if (!t) return false;
  return (
    /\bqa\b/.test(t) ||
    /\bq\.a\.\b/.test(t) ||
    /quality\s*assur/.test(t) ||
    /\bquality\s*engineer/.test(t) ||
    /\btest(ing)?\s*(eng|engineer|lead|manager|analyst)\b/.test(t) ||
    /\bsdet\b/.test(t) ||
    /automation\s*(tester|engineer|qa)/.test(t) ||
    /\bsoftware\s*tester\b/.test(t)
  );
}

function hasAnalystWord(title: string): boolean {
  return /\banalyst\b/i.test(title || '');
}

/**
 * Title compatibility gate used to prevent obviously irrelevant cross-domain
 * matches (e.g. QA Analyst ↔ Compliance Analyst).
 *
 * Rules:
 * - First enforce existing DOMAIN_COMPATIBILITY between candidate and job.
 * - QA/QC specialization: if the candidate looks like QA/test, only allow jobs
 *   whose titles are also QA/test-like.
 * - For overloaded "Analyst" titles, require at least one shared domain keyword
 *   between candidate titles and job title (e.g. "compliance", "risk", "data").
 *
 * When a candidate has no usable titles, this gate returns true to avoid
 * over-filtering; other signals (skills, domain, ATS) must carry the match.
 */
export function isTitleCompatible(candidate: Candidate, job: Job): boolean {
  const jobTitle = job.title || '';
  const candidateTitles = [
    candidate.primary_title || '',
    ...(candidate.secondary_titles || []),
    ...(candidate.target_job_titles || []),
  ].filter(t => (t || '').trim().length > 0);

  // If we have no title information, do not gate — let other signals decide.
  if (!candidateTitles.length || !jobTitle.trim()) return true;

  const jobDomain = classifyDomain(jobTitle);
  const candidateDomains = getCandidateDomains(candidate);

  // 1) Hard domain compatibility gate using existing mapping.
  if (!isDomainCompatible(candidateDomains, jobDomain)) {
    return false;
  }

  // 2) QA/QC specialization — QA candidates should only match QA/test jobs.
  const jobIsQa = hasQaToken(jobTitle) || jobDomain === 'qa';
  const candidateIsQa = candidateTitles.some(t => hasQaToken(t) || classifyDomain(t) === 'qa');

  if (candidateIsQa && !jobIsQa) {
    return false;
  }

  // 3) Overloaded "Analyst" titles — require a shared domain keyword.
  const jobIsAnalyst = hasAnalystWord(jobTitle);
  const candidateHasAnalyst = candidateTitles.some(t => hasAnalystWord(t));

  if ((jobIsAnalyst || candidateHasAnalyst) && !candidateIsQa && !jobIsQa) {
    const domainKeywords = new Set([
      'qa', 'quality', 'test', 'testing', 'automation', 'sdet',
      'compliance', 'risk', 'fraud', 'credit',
      'data', 'analytics', 'bi',
      'marketing', 'growth',
      'finance', 'financial',
      'security', 'cyber', 'infosec',
      'it', 'ops', 'operations',
      'sales', 'revenue',
    ].map(canonicalTerm));

    const jobTokens = new Set(titleTokens(jobTitle));
    const candidateTokens = new Set<string>();
    for (const ct of candidateTitles) {
      for (const tok of titleTokens(ct)) {
        candidateTokens.add(tok);
      }
    }

    let hasSharedDomainKeyword = false;
    for (const kw of Array.from(domainKeywords)) {
      if (jobTokens.has(kw) && candidateTokens.has(kw)) {
        hasSharedDomainKeyword = true;
        break;
      }
    }

    if (!hasSharedDomainKeyword) {
      return false;
    }
  }

  return true;
}

/**
 * Returns true only when BOTH of these hold for at least one candidate title:
 *   1. The domain of the candidate title is compatible with the job domain.
 *   2. At least one meaningful (non-trivial) token is shared between candidate
 *      title and job title — OR both titles are in the same specific domain
 *      (e.g. both 'data-engineering' → allow domain-only match for close roles).
 *
 * This prevents "Java Developer" → "Analyst" and "Data Engineer" → "Data Analyst".
 */
function isTitleMatch(candidate: Candidate, job: Job): boolean {
  const candidateTitles = [
    candidate.primary_title || '',
    ...(candidate.target_job_titles || []),
    ...(candidate.secondary_titles || []),
  ].filter(t => (t || '').trim().length > 0);

  if (candidateTitles.length === 0) return false;

  const jobDomain = classifyDomain(job.title);
  const jobToksSet = new Set(titleTokens(job.title));

  for (const ct of candidateTitles) {
    const cdDomain = classifyDomain(ct);

    // Step 1: domain must be compatible — if not, skip this title entirely.
    if (!isDomainCompatible([cdDomain], jobDomain)) continue;

    // Step 2a: exact same specific domain → allow (e.g. both are data-engineering).
    // This lets "Data Engineer" match "Senior Data Engineer" without needing token
    // overlap (which would fail because "data" and "engineer" are both trivial).
    if (cdDomain === jobDomain && cdDomain !== 'general') {
      if (process.env.DEBUG_MATCHING === 'true') {
        devLog('[MATCH]', { candidate: candidate.full_name, primary_title: candidate.primary_title, target_job_titles: candidate.target_job_titles, job_title: job.title, candidate_title: ct, cdDomain, jobDomain, step: '2a' });
      }
      return true;
    }

    // Step 2b: compatible but different domains → require at least one non-trivial
    // shared token (e.g. "React Developer" matching "Frontend React Engineer").
    const ctToks = titleTokens(ct);
    for (const tok of ctToks) {
      if (!TRIVIAL_TOKENS.has(tok) && tok.length >= 3 && jobToksSet.has(tok)) {
        if (process.env.DEBUG_MATCHING === 'true') {
          devLog('[MATCH]', { candidate: candidate.full_name, primary_title: candidate.primary_title, target_job_titles: candidate.target_job_titles, job_title: job.title, candidate_title: ct, cdDomain, jobDomain, step: '2b', shared_token: tok });
        }
        return true;
      }
    }

    // Step 2c: both classified as 'general' (e.g. "Coordinator") → require token overlap.
    if (cdDomain === 'general' && jobDomain === 'general') {
      const ctToksSet = new Set(ctToks);
      for (const tok of titleTokens(job.title)) {
        if (!TRIVIAL_TOKENS.has(tok) && tok.length >= 3 && ctToksSet.has(tok)) {
          if (process.env.DEBUG_MATCHING === 'true') {
            devLog('[MATCH]', { candidate: candidate.full_name, primary_title: candidate.primary_title, target_job_titles: candidate.target_job_titles, job_title: job.title, candidate_title: ct, cdDomain, jobDomain, step: '2c', shared_token: tok });
          }
          return true;
        }
      }
    }
  }

  return false;
}

// ── Main: Run Matching ───────────────────────────────────────────────────────

export async function runMatching(
  candidateId?: string,
  onProgress?: (msg: string) => void,
  options?: { jobsSince?: string },
) {
  const MIN_SCORE = 50; // titles + skills combined
  const supabase = createServiceClient();
  const log = (m: string) => { devLog('[MATCH] ' + m); onProgress?.(m); };

  const MAX_MATCHES_PER_CANDIDATE = await getIntFlagOrDefault(
    supabase,
    'matching.v3.max_matches_per_candidate',
    DEFAULT_MAX_MATCHES_PER_CANDIDATE,
  );

  let q = supabase.from('candidates').select('*').eq('active', true).not('invite_accepted_at', 'is', null);
  if (candidateId) q = q.eq('id', candidateId);
  const { data: candidates, error: cErr } = await q;
  if (cErr) { log('Error fetching candidates: ' + cErr.message); return { candidates_processed: 0, total_matches_upserted: 0, summary: [] }; }
  if (!candidates?.length) { log('No active candidates.'); return { candidates_processed: 0, total_matches_upserted: 0, summary: [] }; }

  // Paginate past Supabase's 1000-row default limit to fetch ALL active jobs.
  const PAGE_SIZE = 1000;
  let allJobs: any[] = [];
  let from = 0;
  let jobFetchError: string | null = null;
  const jobsSinceDate = options?.jobsSince ? new Date(options.jobsSince) : null;
  if (jobsSinceDate && isNaN(jobsSinceDate.getTime())) {
    jobFetchError = 'Invalid jobsSince date';
  } else {
    while (true) {
      let q2 = supabase
        .from('jobs')
        .select('id, title, company, must_have_skills, nice_to_have_skills')
        .eq('is_active', true)
        .range(from, from + PAGE_SIZE - 1);
      if (jobsSinceDate) {
        q2 = q2.gte('created_at', options!.jobsSince!);
      }
      const { data: page, error: pageErr } = await q2;
      if (pageErr) { jobFetchError = pageErr.message; break; }
      if (!page || page.length === 0) break;
      allJobs = allJobs.concat(page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  if (jobFetchError) { log('Error fetching jobs: ' + jobFetchError); return { candidates_processed: candidates.length, total_matches_upserted: 0, summary: [] }; }
  if (!allJobs.length) { log('No active jobs.'); return { candidates_processed: candidates.length, total_matches_upserted: 0, summary: [] }; }
  const jobs = allJobs;
  if (jobsSinceDate) log(`Incremental mode — only jobs since ${options!.jobsSince} (${jobs.length} jobs)`);

  const candidateIds = (candidates as Candidate[]).map((c) => c.id);
  const hiddenByCandidate = new Map<string, Set<string>>();
  try {
    const { data: hiddenRows } = await supabase.from('candidate_hidden_jobs').select('candidate_id, job_id').in('candidate_id', candidateIds);
    for (const h of hiddenRows || []) {
      if (!hiddenByCandidate.has(h.candidate_id)) hiddenByCandidate.set(h.candidate_id, new Set());
      hiddenByCandidate.get(h.candidate_id)!.add(h.job_id);
    }
  } catch (_) { }

  log(`Title + skills matching: ${candidates.length} candidates × ${jobs.length} jobs.`);

  let totalMatchesUpserted = 0;
  const summary: any[] = [];
  const now = new Date().toISOString();

  for (const candidate of candidates as Candidate[]) {
    const hasTitles = !!(
      candidate.primary_title?.trim() ||
      (candidate.target_job_titles || []).some(t => t?.trim())
    );

    if (!hasTitles) {
      log(`${candidate.full_name}: Skipped — no titles set (primary or target).`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'No Titles' });
      continue;
    }

    const scored: Array<{ job: Job; score: number; titleComponent: number; skillsComponent: number }> = [];

    for (const job of jobs as Job[]) {
      if (hiddenByCandidate.get(candidate.id)?.has(job.id)) continue;
      const titleComponent = simpleTitleScore(candidate, job);
      const skillsComponent = simpleSkillsScore(candidate, job);
      const score = Math.round(titleComponent * 0.4 + skillsComponent * 0.6);
      if (score >= MIN_SCORE) {
        scored.push({ job, score, titleComponent, skillsComponent });
      }
    }

    if (!scored.length) {
      log(`${candidate.full_name}: 0 title + skills matches.`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'No Matches Found' });
      continue;
    }

    const rows = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES_PER_CANDIDATE)
      .map(({ job, score, titleComponent, skillsComponent }) => ({
        candidate_id: candidate.id,
        job_id: job.id,
        fit_score: score,
        match_reason: 'Primary title + target titles + skills match',
        best_resume_id: null,
        matched_keywords: [],
        missing_keywords: [],
        matched_at: now,
        score_breakdown: {
          version: 4,
          title_match: titleComponent > 0,
          components: {
            title: Math.round(titleComponent),
            skills: Math.round(skillsComponent),
          },
        },
      }));

    const { error: saveErr } = await supabase
      .from('candidate_job_matches')
      .upsert(rows, { onConflict: 'candidate_id,job_id' });

    if (!saveErr) {
      totalMatchesUpserted += rows.length;
      log(`✅ ${candidate.full_name}: ${rows.length} title-matched jobs`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: rows.length, status: 'Matched' });
    } else {
      log(`Save error for ${candidate.full_name}: ${saveErr.message}`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'Save Error' });
    }
  }

  return { candidates_processed: (candidates as Candidate[]).length, total_matches_upserted: totalMatchesUpserted, summary };
}

/**
 * Incremental matching: match all active candidates against a specific list of job IDs only.
 * Used after job upload so we don't re-process the entire job table every time.
 */
export async function runMatchingForJobs(
  jobIds: string[],
  onProgress?: (msg: string) => void,
): Promise<{ candidates_processed: number; total_matches_upserted: number; summary: any[] }> {
  if (!jobIds.length) return { candidates_processed: 0, total_matches_upserted: 0, summary: [] };

  const supabase = createServiceClient();
  const log = (m: string) => { devLog('[MATCH] ' + m); onProgress?.(m); };

  const MAX_MATCHES_PER_CANDIDATE = await getIntFlagOrDefault(
    supabase,
    'matching.v3.max_matches_per_candidate',
    DEFAULT_MAX_MATCHES_PER_CANDIDATE,
  );

  const { data: candidates, error: cErr } = await supabase
    .from('candidates')
    .select('*')
    .eq('active', true)
    .not('invite_accepted_at', 'is', null);
  if (cErr || !candidates?.length) {
    log('No active candidates.');
    return { candidates_processed: 0, total_matches_upserted: 0, summary: [] };
  }

  const { data: jobs, error: jErr } = await supabase
    .from('jobs')
    .select('id, title, company, must_have_skills, nice_to_have_skills')
    .in('id', jobIds)
    .eq('is_active', true);
  if (jErr || !jobs?.length) {
    log('No matching jobs found for provided IDs.');
    return { candidates_processed: candidates.length, total_matches_upserted: 0, summary: [] };
  }

  log(`Incremental: ${candidates.length} candidates × ${jobs.length} new jobs.`);

  const candidateIds = (candidates as Candidate[]).map((c) => c.id);
  const hiddenByCandidate = new Map<string, Set<string>>();
  try {
    const { data: hiddenRows } = await supabase.from('candidate_hidden_jobs').select('candidate_id, job_id').in('candidate_id', candidateIds);
    for (const h of hiddenRows || []) {
      if (!hiddenByCandidate.has(h.candidate_id)) hiddenByCandidate.set(h.candidate_id, new Set());
      hiddenByCandidate.get(h.candidate_id)!.add(h.job_id);
    }
  } catch (_) { }

  let totalMatchesUpserted = 0;
  const summary: any[] = [];
  const now = new Date().toISOString();

  for (const candidate of candidates as Candidate[]) {
    const hasTitles = !!(
      candidate.primary_title?.trim() ||
      (candidate.target_job_titles || []).some(t => t?.trim())
    );
    if (!hasTitles) continue;

    const scored: Array<{ job: Job; score: number; titleComponent: number; skillsComponent: number }> = [];

    for (const job of jobs as Job[]) {
      if (hiddenByCandidate.get(candidate.id)?.has(job.id)) continue;
      const titleComponent = simpleTitleScore(candidate, job);
      const skillsComponent = simpleSkillsScore(candidate, job);
      const score = Math.round(titleComponent * 0.4 + skillsComponent * 0.6);
      if (score >= 50) {
        scored.push({ job, score, titleComponent, skillsComponent });
      }
    }
    if (!scored.length) continue;

    const rows = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES_PER_CANDIDATE)
      .map(({ job, score, titleComponent, skillsComponent }) => ({
        candidate_id: candidate.id,
        job_id: job.id,
        fit_score: score,
        match_reason: 'Primary title + target titles + skills match',
        best_resume_id: null,
        matched_keywords: [],
        missing_keywords: [],
        matched_at: now,
        score_breakdown: {
          version: 4,
          title_match: titleComponent > 0,
          components: {
            title: Math.round(titleComponent),
            skills: Math.round(skillsComponent),
          },
        },
      }));

    const { error: saveErr } = await supabase
      .from('candidate_job_matches')
      .upsert(rows, { onConflict: 'candidate_id,job_id' });

    if (!saveErr) {
      totalMatchesUpserted += rows.length;
      log(`✅ ${candidate.full_name}: +${rows.length} new title-matched jobs`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: rows.length, status: 'Matched' });
    } else {
      log(`Save error for ${candidate.full_name}: ${saveErr.message}`);
    }
  }

  return { candidates_processed: (candidates as Candidate[]).length, total_matches_upserted: totalMatchesUpserted, summary };
}

// Test-only exports for unit testing
export const _testClassifyDomain = classifyDomain;
export const _testIsTitleMatch = isTitleMatch;
