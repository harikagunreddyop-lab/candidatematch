import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase-server';
import { extractJobRequirements, computeATSScore, type JobRequirements } from '@/lib/ats-engine';
import { log as devLog, error as logError } from '@/lib/logger';
import { getComputedYears } from '@/lib/experience-merger';
import {
  getPolicy,
  computeConfidenceBucket,
  floatConfidenceToInt,
  evaluateGateDecision,
  applyFairnessExclusions,
  type ScoringProfile,
} from '@/lib/policy-engine';
import { emitEvent } from '@/lib/telemetry';
import { buildFixReport } from '@/lib/fix-report';
import { computeSemanticSimilarity } from '@/lib/semantic-similarity';
import { lookupCalibration } from '@/lib/calibration/isotonic';
import { upsertJobSkillIndex, upsertCandidateSkillIndex } from '@/lib/skill-index';

const DEFAULT_MAX_MATCHES_PER_CANDIDATE = 500;
const MAX_RESUME_TEXT_LEN = 4000;

// ── Engine version ────────────────────────────────────────────────────────────
// Increment this string whenever scoring logic changes materially.
// Stored in candidate_job_matches.ats_model_version for reproducibility.
const ATS_MODEL_VERSION = 'v2';

// ── ATS result cache ─────────────────────────────────────────────────────────
// Before re-running expensive PDF extraction + LLM scoring, look up the
// scoring_runs table for a row matching the same inputs hash.
// Cache key: (candidate_id, job_id, model_version, inputs_hash)
// inputs_hash is computed from: resume_id|resume_version_id + jd_length + model_version.
// If found, return the cached result immediately — no LLM calls needed.
async function checkAtsCache(
  supabase: any,
  candidateId: string,
  jobId: string,
  modelVersion: string,
  inputs: {
    resumeId: string | null;
    resumeVersionId: string | null;
    jdLength: number;
  },
): Promise<{
  hit: boolean;
  result?: { ats_score: number; ats_reason: string; ats_breakdown: any; ats_resume_id: string | null; ats_checked_at: string; matched_keywords: string[]; missing_keywords: string[] };
}> {
  try {
    // Build the same input summary used during scoring_runs insert
    const inputsSummary = {
      candidate_id: candidateId,
      job_id: jobId,
      ats_resume_id: inputs.resumeId,
      resume_version_id: inputs.resumeVersionId,
      model_version: modelVersion,
      jd_length: inputs.jdLength,
    };
    const canonical = JSON.stringify(inputsSummary, Object.keys(inputsSummary).sort());
    const inputsHash = createHash('sha256').update(canonical).digest('hex');

    const { data: cached, error } = await supabase
      .from('scoring_runs')
      .select('total_score, dimensions_json, confidence, candidate_id')
      .eq('candidate_id', candidateId)
      .eq('job_id', jobId)
      .eq('model_version', modelVersion)
      .eq('inputs_hash', inputsHash)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !cached) return { hit: false };

    // Fetch the full persisted match row for the enriched breakdown
    const { data: matchRow } = await supabase
      .from('candidate_job_matches')
      .select('ats_score, ats_reason, ats_breakdown, ats_resume_id, ats_checked_at, matched_keywords, missing_keywords')
      .eq('candidate_id', candidateId)
      .eq('job_id', jobId)
      .maybeSingle();

    if (!matchRow || matchRow.ats_score == null) return { hit: false };

    return {
      hit: true,
      result: {
        ats_score: matchRow.ats_score,
        ats_reason: matchRow.ats_reason ?? '',
        ats_breakdown: matchRow.ats_breakdown ?? {},
        ats_resume_id: matchRow.ats_resume_id ?? null,
        ats_checked_at: matchRow.ats_checked_at ?? new Date().toISOString(),
        matched_keywords: matchRow.matched_keywords ?? [],
        missing_keywords: matchRow.missing_keywords ?? [],
      },
    };
  } catch {
    // Cache miss on any error — proceed with full computation
    return { hit: false };
  }
}

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

async function isMatchingV3Enabled(supabase: any): Promise<boolean> {
  return isFlagEnabled(supabase, 'matching.v3.enabled');
}

async function computeSkillOverlapScores(
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

function parseSkills(skills: any): string[] {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.map(String).filter(Boolean);
  if (typeof skills === 'string') {
    try {
      const parsed = JSON.parse(skills);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return skills.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return []; } }
  return [];
}

function canonicalTerm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9#+.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


// ── Resume extraction ────────────────────────────────────────────────────────
// Delegated to resume-pdf-text.ts so unpdf is not in the /api/matches bundle path.

async function getResumeTextFromStorage(supabase: any, pdfPath: string): Promise<string> {
  const { extractResumeTextFromStorage } = await import('@/lib/resume-pdf-text');
  return extractResumeTextFromStorage(supabase, pdfPath);
}


// ── JD Requirements: extract once & cache ────────────────────────────────────

async function getOrExtractRequirements(supabase: any, job: Job): Promise<JobRequirements | null> {
  if (job.structured_requirements && typeof job.structured_requirements === 'object' && job.structured_requirements.must_have_skills) {
    const cached = job.structured_requirements as JobRequirements;
    return { ...cached, responsibilities: cached.responsibilities ?? [] };
  }

  const jd = (job.jd_clean || job.jd_raw || '').trim();
  const minimal: JobRequirements = {
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

  const reqs = await extractJobRequirements(job.title, jd, job.location);
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

export async function runAtsCheck(
  supabase: any,
  candidateId: string,
  jobId: string,
  resumeId?: string | null,
  options?: {
    /** A=OPT/agency (default), C=enterprise internal mobility */
    scoringProfile?: ScoringProfile;
    /** Actor user who triggered the check (for audit) */
    actorUserId?: string | null;
    /** Source of the check (default: 'manual') */
    source?: string;
    /** Tailored resume version (from resume_versions) — scored instead of candidate_resumes */
    resumeVersionId?: string | null;
    /** When false, compute score but do not persist or emit (used by runAtsCheckBatch) */
    persist?: boolean;
  },
): Promise<{ ats_score: number; ats_reason: string; ats_breakdown: any; ats_resume_id: string | null; ats_checked_at: string; matched_keywords?: string[]; missing_keywords?: string[] }> {
  const startMs = Date.now();
  const now = new Date().toISOString();

  // ── Cache check: skip expensive PDF + LLM work if inputs haven't changed ────
  // Only check cache when persist !== false (batch sub-calls skip this; the batch
  // level persists the best result after comparing all resumes).
  if (options?.persist !== false) {
    // Get jd_length cheaply without fetching the full job record yet
    const { data: jobMeta } = await supabase
      .from('jobs')
      .select('jd_clean, jd_raw')
      .eq('id', jobId)
      .single();
    const jdLength = ((jobMeta?.jd_clean || jobMeta?.jd_raw) ?? '').length;

    const cacheCheck = await checkAtsCache(supabase, candidateId, jobId, ATS_MODEL_VERSION, {
      resumeId: resumeId ?? null,
      resumeVersionId: options?.resumeVersionId ?? null,
      jdLength,
    });
    if (cacheCheck.hit && cacheCheck.result) {
      return cacheCheck.result;
    }
  }

  // ── Resolve profile and policy ──────────────────────────────────────────────
  const scoringProfile: ScoringProfile = options?.scoringProfile ?? 'A';
  const policy = getPolicy(scoringProfile);
  const source = options?.source ?? 'manual';

  const [{ data: candidate, error: candErr }, { data: job, error: jobErr }] = await Promise.all([
    supabase.from('candidates').select('*').eq('id', candidateId).single(),
    supabase.from('jobs').select('*').eq('id', jobId).single(),
  ]);
  if (candErr || !candidate) throw new Error(candErr?.message || 'Candidate not found');
  if (jobErr || !job) throw new Error(jobErr?.message || 'Job not found');

  // ── Resume text resolution ──────────────────────────────────────────────────
  // Priority: resumeVersionId (tailored) → explicit resumeId → match.best_resume_id → latest candidate resume → parsed_resume_text
  let chosenResumeId: string | null = null;
  let resumeText = '';

  if (options?.resumeVersionId) {
    const { data: rv, error: rvErr } = await supabase
      .from('resume_versions')
      .select('id, pdf_path, generation_status, resume_text')
      .eq('id', options.resumeVersionId)
      .eq('candidate_id', candidateId)
      .eq('job_id', jobId)
      .single();
    if (!rvErr && rv?.generation_status === 'completed' && rv?.pdf_path) {
      // Prefer stored plain text (DOCX tailored resumes); fallback to storage extraction (PDF)
      if (rv.resume_text && String(rv.resume_text).trim()) {
        resumeText = String(rv.resume_text).slice(0, MAX_RESUME_TEXT_LEN);
      } else {
        resumeText = await getResumeTextFromStorage(supabase, rv.pdf_path);
      }
      chosenResumeId = null; // Tailored resume: no candidate_resumes id
    }
  }

  if (!resumeText) {
    chosenResumeId = resumeId ?? null;
    if (!chosenResumeId) {
      const { data: matchRow } = await supabase
        .from('candidate_job_matches')
        .select('best_resume_id')
        .eq('candidate_id', candidateId)
        .eq('job_id', jobId)
        .single();
      chosenResumeId = matchRow?.best_resume_id ?? null;
    }

    if (chosenResumeId) {
      const { data: r, error: rErr } = await supabase
        .from('candidate_resumes')
        .select('id, candidate_id, pdf_path')
        .eq('id', chosenResumeId)
        .single();
      if (!rErr && r?.candidate_id === candidateId) {
        resumeText = await getResumeTextFromStorage(supabase, r.pdf_path);
      }
    }
    if (!resumeText) {
      const { data: latest } = await supabase
        .from('candidate_resumes')
        .select('id, pdf_path')
        .eq('candidate_id', candidateId)
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest?.pdf_path) {
        chosenResumeId = latest.id;
        resumeText = await getResumeTextFromStorage(supabase, latest.pdf_path);
      }
    }
  }

  if (!resumeText) {
    resumeText = (candidate.parsed_resume_text || '').slice(0, MAX_RESUME_TEXT_LEN);
    chosenResumeId = chosenResumeId ?? null;
  }

  // ── Experience duration computation ────────────────────────────────────────
  // PHASE 1 patch: compute merged-interval years alongside profile years.
  // If profile has years_of_experience, that remains the PRIMARY value passed
  // to computeATSScore (no behavior change for existing records).
  // The computed value is stored in ats_breakdown for diagnostics.
  const candidateExp = parseArray(candidate.experience);
  const computedExp = getComputedYears(candidateExp, true /* excludeInternships */);
  const profileYears: number | null = candidate.years_of_experience ?? null;

  // Emit discrepancy event when the self-reported value is significantly inflated
  // Threshold: 2.0 years gap and high computation confidence
  if (
    profileYears != null &&
    computedExp.confidence >= 0.6 &&
    Math.abs(profileYears - computedExp.years) >= 2.0
  ) {
    void emitEvent(supabase, {
      event_type: 'candidate_years_discrepancy',
      candidate_id: candidateId,
      job_id: jobId,
      event_source: source,
      payload: {
        profile_years: profileYears,
        computed_years: computedExp.years,
        delta: profileYears - computedExp.years,
        confidence: computedExp.confidence,
      },
    });
  }

  // ── Build candidate data (apply fairness exclusions for Profile C) ──────────
  const candidateSkills = parseSkills(candidate.skills);
  const candidateTools = parseSkills(candidate.tools);
  const candidateEdu = parseArray(candidate.education);
  const candidateCerts = parseArray(candidate.certifications);

  const rawCandidateData = {
    primary_title: candidate.primary_title,
    secondary_titles: candidate.secondary_titles || [],
    skills: candidateSkills,
    tools: candidateTools,
    experience: candidateExp,
    education: candidateEdu,
    certifications: candidateCerts,
    location: candidate.location,
    visa_status: candidate.visa_status,
    years_of_experience: profileYears ?? undefined,
    open_to_remote: (candidate as any).open_to_remote ?? true,
    open_to_relocation: (candidate as any).open_to_relocation ?? false,
    target_locations: (candidate as any).target_locations || [],
    resume_text: resumeText,
  };

  // Fairness exclusions for enterprise profile (Profile C)
  const candidateData = applyFairnessExclusions(rawCandidateData, policy);

  // Keep candidate_skill_index in sync using profile skills/tools
  try {
    const skillEvidence = [
      ...(candidateSkills || []).map((name: string) => ({ name, source: 'list' as const })),
      ...(candidateTools || []).map((name: string) => ({ name, source: 'list' as const })),
    ];
    if (skillEvidence.length) {
      await upsertCandidateSkillIndex(candidateId, skillEvidence);
    }
  } catch (e) {
    logError('[matching] upsertCandidateSkillIndex failed', e);
  }

  const reqs = await getOrExtractRequirements(supabase, job as Job);
  if (!reqs) throw new Error('Could not extract job requirements');

  const jd = (job.jd_clean || job.jd_raw || '').trim();
  const resumeBullets = candidateData.experience.flatMap(e => e.responsibilities || []).filter(Boolean);
  const jdResponsibilities = (reqs.responsibilities?.length ? reqs.responsibilities : job.structured_requirements?.responsibilities) ?? [];

  // Compute semantic similarity BEFORE scoring (v4 needs it for C_resp)
  let bulletsResponsibilitiesSim: number | null = null;
  if (
    (await isFlagEnabled(supabase, 'elite.semantic_similarity')) &&
    chosenResumeId &&
    resumeBullets.length > 0 &&
    jdResponsibilities.length > 0
  ) {
    const sem = await computeSemanticSimilarity(
      supabase,
      chosenResumeId,
      jobId,
      resumeText,
      jd,
      resumeBullets,
      jdResponsibilities,
      candidateId,
    );
    bulletsResponsibilitiesSim = sem?.bullets_responsibilities_similarity ?? null;
  }

  const result = await computeATSScore(job.title, jd, reqs, candidateData, {
    bulletsResponsibilitiesSim,
  });

  const computationMs = Date.now() - startMs;

  // ── Confidence (from v4 scorer: 0–1, convert to 0–100 for bucket)
  const atsConfidence = floatConfidenceToInt(result.confidence ?? 0.5);
  const confidenceBucket = computeConfidenceBucket(atsConfidence);
  const matchedCount = result.matched_keywords.length;

  // ── Apply gate via policy engine ────────────────────────────────────────────
  // NOTE: gateDecision is computed and logged but does NOT change existing gate
  // behavior until feature flag 'elite.confidence_gate' is ON.
  const gateDecision = evaluateGateDecision(result.total_score, confidenceBucket, policy);

  const jobFamily = reqs.domain || 'general';
  const calibration = await lookupCalibration(supabase, scoringProfile, result.total_score, jobFamily);

  // ── Fix report (actionable recommendations) ─────────────────────────────────
  const fixReport = buildFixReport({
    total_score: result.total_score,
    dimensions: result.dimensions,
    matched_keywords: result.matched_keywords,
    missing_keywords: result.missing_keywords,
    evidence_spans: result.dimensions?.must?.evidence_spans,
    gate_passed: result.gate_passed,
    negative_signals: result.negative_signals,
  });

  // ── Build the enriched breakdown ────────────────────────────────────────────
  const enrichedBreakdown = {
    dimensions: result.dimensions,
    fix_report: fixReport,
    model_version: ATS_MODEL_VERSION,
    scoring_profile: scoringProfile,
    confidence: atsConfidence,
    confidence_bucket: confidenceBucket,
    evidence_count: matchedCount,
    band: result.band,
    gate_passed: result.gate_passed,
    gate_reason: result.gate_reason,
    negative_signals: result.negative_signals,
    // Experience computation
    computed_years: computedExp.years,
    computed_years_confidence: computedExp.confidence,
    experience_months: computedExp.evidence.total_months,
    // Gate evaluation (computed; not enforced until flag is ON)
    gate_decision: gateDecision,
    // Responsibility semantic alignment (JD duties ↔ resume bullets); set when elite.semantic_similarity ON
    bullets_responsibilities_similarity: bulletsResponsibilitiesSim,
    // Role-family calibration: P(interview) from score + job_family (when calibration curves exist)
    job_family: jobFamily,
    p_interview: calibration?.p_interview ?? null,
    calibration_reliable: calibration?.reliable ?? false,
  };

  // ── Persist to candidate_job_matches (skip when persist: false for batch mode) ──
  const atsV3Enabled = await isFlagEnabled(supabase, 'ats.v3.enabled');

  // v3 match tier (metadata only; does not auto-apply)
  let matchTier: 'match' | 'shortlist' | 'autoapply' = 'match';
  if (gateDecision.passes) {
    matchTier = 'shortlist';
  }

  const atsRow = {
    ats_score: result.total_score,
    ats_reason: result.reason,
    ats_breakdown: enrichedBreakdown,
    ats_checked_at: now,
    ats_resume_id: chosenResumeId,
    matched_keywords: result.matched_keywords || [],
    missing_keywords: result.missing_keywords || [],
    ats_model_version: ATS_MODEL_VERSION,
    ats_confidence: atsConfidence,
    ats_confidence_bucket: confidenceBucket,
    ats_evidence_count: matchedCount,
    ats_last_scored_at: now,
    scoring_profile: scoringProfile,
    // v3 additive columns (only populated when flag is ON)
    match_tier: atsV3Enabled ? matchTier : 'match',
    p_interview: atsV3Enabled ? calibration?.p_interview ?? null : null,
    ats_version: atsV3Enabled ? 3 : 2,
    weights_version: atsV3Enabled ? 2 : 1,
    calibration_version: atsV3Enabled && calibration ? 1 : 0,
    ats_breakdown_v3: atsV3Enabled ? enrichedBreakdown : null,
    evidence_spans: atsV3Enabled ? (result.dimensions?.must?.evidence_spans ?? null) : null,
    negative_signals: atsV3Enabled ? (result.negative_signals ?? null) : null,
    gate_core_passed: atsV3Enabled ? result.gate_passed : null,
    gate_core_reason: atsV3Enabled ? result.gate_reason : null,
    gate_policy_passed: atsV3Enabled ? gateDecision.passes : null,
    gate_policy_reason: atsV3Enabled ? gateDecision.reason : null,
    score_computed_at: atsV3Enabled ? now : null,
  };

  if (options?.persist !== false) {
    await supabase
      .from('candidate_job_matches')
      .upsert([{ candidate_id: candidateId, job_id: jobId, ...atsRow }], { onConflict: 'candidate_id,job_id' });
  }

  // ── Scoring runs: audit trail for reproducibility (Profile C / governance) ──
  if (options?.persist !== false && policy.governance.always_write_scoring_run) {
    const inputsSummary = {
      candidate_id: candidateId,
      job_id: jobId,
      ats_resume_id: chosenResumeId,
      resume_version_id: options?.resumeVersionId ?? null,
      model_version: ATS_MODEL_VERSION,
      scoring_profile: scoringProfile,
      job_title: (job as any).title,
      jd_length: ((job as any).jd_clean || (job as any).jd_raw || '').length,
      must_have_count: reqs.must_have_skills.length,
      resume_text_length: resumeText.length,
    };
    const canonical = JSON.stringify(inputsSummary, Object.keys(inputsSummary).sort());
    const inputsHash = createHash('sha256').update(canonical).digest('hex');
    void supabase.from('scoring_runs').insert({
      candidate_id: candidateId,
      job_id: jobId,
      model_version: ATS_MODEL_VERSION,
      scoring_profile: scoringProfile,
      inputs_hash: inputsHash,
      inputs_summary: inputsSummary,
      total_score: result.total_score,
      dimensions_json: result.dimensions,
      confidence: atsConfidence,
      confidence_bucket: confidenceBucket,
      evidence_count: matchedCount,
    }).then(({ error }: { error: { message: string } | null }) => {
      if (error) logError('scoring_runs insert failed', { error: error.message, candidateId, jobId });
    });
  }

  // ── Telemetry: emit ats_score_computed event (skip when persist: false) ──
  if (options?.persist !== false) {
    void emitEvent(supabase, {
      event_type: 'ats_score_computed',
      candidate_id: candidateId,
      job_id: jobId,
      actor_user_id: options?.actorUserId ?? null,
      event_source: source,
      payload: {
        ats_score: result.total_score,
        ats_confidence: atsConfidence,
        ats_confidence_bucket: confidenceBucket,
        ats_evidence_count: matchedCount,
        model_version: ATS_MODEL_VERSION,
        scoring_profile: scoringProfile,
        job_family: jobFamily,
        computation_ms: computationMs,
        ai_tokens_used: null,
      },
    });
  }

  return {
    ats_score: result.total_score,
    ats_reason: result.reason,
    ats_breakdown: enrichedBreakdown,
    ats_resume_id: chosenResumeId,
    ats_checked_at: now,
    matched_keywords: result.matched_keywords || [],
    missing_keywords: result.missing_keywords || [],
  };
}

/** Run ATS check against a pasted job description (no job in DB). Ephemeral — no persist, no emit. */
export async function runAtsCheckPasted(
  supabase: any,
  candidateId: string,
  jdText: string,
  resumeId?: string | null,
  options?: { scoringProfile?: ScoringProfile },
): Promise<{ ats_score: number; ats_reason: string; ats_breakdown: any; ats_resume_id: string | null; ats_checked_at: string; matched_keywords?: string[]; missing_keywords?: string[] }> {
  const jd = String(jdText || '').trim();
  if (!jd) throw new Error('Job description cannot be empty');

  const scoringProfile: ScoringProfile = options?.scoringProfile ?? 'A';
  const policy = getPolicy(scoringProfile);
  const now = new Date().toISOString();

  const { data: candidate, error: candErr } = await supabase.from('candidates').select('*').eq('id', candidateId).single();
  if (candErr || !candidate) throw new Error(candErr?.message || 'Candidate not found');

  const titleMatch = jd.split(/\n/)[0]?.trim().slice(0, 100);
  const jobTitle = titleMatch && titleMatch.length > 5 ? titleMatch : 'Pasted Job';

  const reqs = await extractJobRequirements(jobTitle, jd);
  const minimal: JobRequirements = {
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
    domain: classifyDomain(jobTitle),
    industry_vertical: null,
    behavioral_keywords: [],
    context_phrases: [],
    responsibilities: reqs?.responsibilities ?? [],
  };
  const finalReqs = reqs || minimal;

  let chosenResumeId: string | null = resumeId ?? null;
  let resumeText = '';

  if (chosenResumeId) {
    const { data: r } = await supabase.from('candidate_resumes').select('id, pdf_path').eq('id', chosenResumeId).eq('candidate_id', candidateId).single();
    if (r?.pdf_path) resumeText = await getResumeTextFromStorage(supabase, r.pdf_path);
  }
  if (!resumeText) {
    const { data: latest } = await supabase.from('candidate_resumes').select('id, pdf_path').eq('candidate_id', candidateId).order('uploaded_at', { ascending: false }).limit(1).maybeSingle();
    if (latest?.pdf_path) {
      chosenResumeId = latest.id;
      resumeText = await getResumeTextFromStorage(supabase, latest.pdf_path);
    }
  }
  if (!resumeText) resumeText = (candidate.parsed_resume_text || '').slice(0, MAX_RESUME_TEXT_LEN);

  const candidateExp = parseArray(candidate.experience);
  const computedExp = getComputedYears(candidateExp, true);
  const profileYears: number | null = candidate.years_of_experience ?? null;
  const candidateSkills = parseSkills(candidate.skills);
  const candidateTools = parseSkills(candidate.tools);
  const candidateEdu = parseArray(candidate.education);
  const candidateCerts = parseArray(candidate.certifications);
  const rawCandidateData = {
    primary_title: candidate.primary_title,
    secondary_titles: candidate.secondary_titles || [],
    skills: candidateSkills,
    tools: candidateTools,
    experience: candidateExp,
    education: candidateEdu,
    certifications: candidateCerts,
    location: candidate.location,
    visa_status: candidate.visa_status,
    years_of_experience: profileYears ?? undefined,
    open_to_remote: (candidate as any).open_to_remote ?? true,
    open_to_relocation: (candidate as any).open_to_relocation ?? false,
    target_locations: (candidate as any).target_locations || [],
    resume_text: resumeText,
  };
  const candidateData = applyFairnessExclusions(rawCandidateData, policy);

  const result = await computeATSScore(jobTitle, jd, finalReqs, candidateData, { bulletsResponsibilitiesSim: null });
  const atsConfidence = floatConfidenceToInt(result.confidence ?? 0.5);
  const confidenceBucket = computeConfidenceBucket(atsConfidence);
  const matchedCount = result.matched_keywords.length;
  const gateDecision = evaluateGateDecision(result.total_score, confidenceBucket, policy);
  const jobFamily = finalReqs.domain || 'general';
  const calibration = await lookupCalibration(supabase, scoringProfile, result.total_score, jobFamily);
  const fixReport = buildFixReport({
    total_score: result.total_score,
    dimensions: result.dimensions,
    matched_keywords: result.matched_keywords,
    missing_keywords: result.missing_keywords,
    evidence_spans: result.dimensions?.must?.evidence_spans,
    gate_passed: result.gate_passed,
    negative_signals: result.negative_signals,
  });
  const enrichedBreakdown = {
    dimensions: result.dimensions,
    fix_report: fixReport,
    model_version: ATS_MODEL_VERSION,
    scoring_profile: scoringProfile,
    confidence: atsConfidence,
    confidence_bucket: confidenceBucket,
    evidence_count: matchedCount,
    band: result.band,
    gate_passed: result.gate_passed,
    gate_reason: result.gate_reason,
    negative_signals: result.negative_signals,
    computed_years: computedExp.years,
    computed_years_confidence: computedExp.confidence,
    experience_months: computedExp.evidence.total_months,
    gate_decision: gateDecision,
    bullets_responsibilities_similarity: null,
    job_family: jobFamily,
    p_interview: calibration?.p_interview ?? null,
    calibration_reliable: calibration?.reliable ?? false,
  };

  return {
    ats_score: result.total_score,
    ats_reason: result.reason,
    ats_breakdown: enrichedBreakdown,
    ats_resume_id: chosenResumeId,
    ats_checked_at: now,
    matched_keywords: result.matched_keywords || [],
    missing_keywords: result.missing_keywords || [],
  };
}

/** Per-resume score for batch ATS check */
export interface PerResumeScore {
  label: string;
  resume_id?: string | null;
  resume_version_id?: string | null;
  ats_score: number;
  is_best?: boolean;
}

/**
 * Scores all available resumes (uploaded + tailored) for a job, persists best, returns all scores.
 */
export async function runAtsCheckBatch(
  supabase: any,
  candidateId: string,
  jobId: string,
  options?: {
    scoringProfile?: ScoringProfile;
    actorUserId?: string | null;
    source?: string;
  },
): Promise<{
  ats_score: number;
  ats_reason: string;
  ats_breakdown: any;
  ats_resume_id: string | null;
  ats_checked_at: string;
  matched_keywords?: string[];
  missing_keywords?: string[];
  per_resume_scores: PerResumeScore[];
}> {
  const jobTitle = (await supabase.from('jobs').select('title').eq('id', jobId).single()).data?.title || 'this role';

  const [{ data: candidateResumes }, { data: tailoredVersions }] = await Promise.all([
    supabase.from('candidate_resumes').select('id, label').eq('candidate_id', candidateId).order('uploaded_at', { ascending: false }),
    supabase.from('resume_versions')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('job_id', jobId)
      .in('generation_status', ['completed', 'done']),
  ]);

  const sources: { label: string; resume_id?: string | null; resume_version_id?: string }[] = [];
  for (const r of candidateResumes || []) {
    sources.push({ label: r.label || 'Resume', resume_id: r.id });
  }
  if (sources.length === 0) {
    sources.push({ label: 'Profile', resume_id: null });
  }
  for (const tv of tailoredVersions || []) {
    sources.push({ label: `Tailored for ${jobTitle}`, resume_version_id: tv.id });
  }

  const results: Array<{ label: string; resume_id?: string | null; resume_version_id?: string; r: Awaited<ReturnType<typeof runAtsCheck>> }> = [];
  for (const src of sources) {
    try {
      const r = await runAtsCheck(supabase, candidateId, jobId, src.resume_id ?? undefined, {
        resumeVersionId: src.resume_version_id,
        persist: false,
        ...options,
      });
      results.push({ label: src.label, resume_id: src.resume_id, resume_version_id: src.resume_version_id, r });
    } catch (e) {
      devLog('[matching] runAtsCheckBatch: skip failed resume', src.label, e);
    }
  }

  if (results.length === 0) {
    throw new Error('ATS check failed for all resumes');
  }

  const sorted = [...results].sort((a, b) => b.r.ats_score - a.r.ats_score);
  const best = sorted[0].r;

  const perResumeScores: PerResumeScore[] = sorted.map(({ label, resume_id, resume_version_id, r }, i) => ({
    label,
    resume_id: resume_id ?? undefined,
    resume_version_id,
    ats_score: r.ats_score,
    is_best: i === 0,
  }));

  const enrichedWithPerResume = {
    ...best.ats_breakdown,
    per_resume_scores: perResumeScores,
  };

  const atsRow = {
    ats_score: best.ats_score,
    ats_reason: best.ats_reason,
    ats_breakdown: enrichedWithPerResume,
    ats_checked_at: new Date().toISOString(),
    ats_resume_id: best.ats_resume_id,
    best_resume_id: best.ats_resume_id,
    matched_keywords: best.matched_keywords || [],
    missing_keywords: best.missing_keywords || [],
    ats_model_version: ATS_MODEL_VERSION,
    ats_confidence: (best.ats_breakdown as any)?.confidence,
    ats_confidence_bucket: (best.ats_breakdown as any)?.confidence_bucket,
    ats_evidence_count: (best.ats_breakdown as any)?.evidence_count,
    ats_last_scored_at: new Date().toISOString(),
    scoring_profile: options?.scoringProfile ?? 'A',
  };

  await supabase
    .from('candidate_job_matches')
    .upsert([{ candidate_id: candidateId, job_id: jobId, ...atsRow }], { onConflict: 'candidate_id,job_id' });

  void emitEvent(supabase, {
    event_type: 'ats_score_computed',
    candidate_id: candidateId,
    job_id: jobId,
    actor_user_id: options?.actorUserId ?? null,
    event_source: options?.source ?? 'manual',
    payload: {
      ats_score: best.ats_score,
      ats_confidence: (best.ats_breakdown as any)?.confidence ?? null,
      ats_confidence_bucket: (best.ats_breakdown as any)?.confidence_bucket ?? null,
      ats_evidence_count: (best.ats_breakdown as any)?.evidence_count ?? null,
      model_version: ATS_MODEL_VERSION,
      scoring_profile: (options?.scoringProfile ?? 'A') as 'A' | 'C',
      job_family: (best.ats_breakdown as any)?.job_family,
      computation_ms: null,
      ai_tokens_used: null,
    },
  });

  return {
    ...best,
    ats_breakdown: enrichedWithPerResume,
    per_resume_scores: perResumeScores,
  };
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
        .select('id, title, company, location, salary_min, salary_max, remote_type')
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

  log(`Title-based matching: ${candidates.length} candidates × ${jobs.length} jobs.`);

  let totalMatchesUpserted = 0;
  const summary: any[] = [];
  const now = new Date().toISOString();

  for (const candidate of candidates as Candidate[]) {
    const hasTitles = !!(
      candidate.primary_title?.trim() ||
      (candidate.target_job_titles || []).some(t => t?.trim()) ||
      (candidate.secondary_titles || []).some(t => t?.trim())
    );

    if (!hasTitles) {
      log(`${candidate.full_name}: Skipped — no titles set (primary, secondary, or target).`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'No Titles' });
      continue;
    }

    const matchedJobs = (jobs as Job[]).filter(job => {
      if (hiddenByCandidate.get(candidate.id)?.has(job.id)) return false;
      if (!isTitleCompatible(candidate, job)) return false;
      return isTitleMatch(candidate, job);
    });

    if (matchedJobs.length === 0) {
      log(`${candidate.full_name}: 0 title-matched jobs.`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'No Matches Found' });
      continue;
    }

    let jobsForRows = matchedJobs;

    // Optional v3: re-rank title matches by skill overlap when enabled
    const matchingV3On = await isMatchingV3Enabled(supabase);
    let skillScores: Map<string, number> | null = null;
    if (matchingV3On) {
      skillScores = await computeSkillOverlapScores(supabase, candidate.id, matchedJobs as Job[]);
      if (skillScores && skillScores.size) {
        jobsForRows = [...matchedJobs].sort((a, b) => {
          const sb = skillScores!.get(b.id) ?? 0;
          const sa = skillScores!.get(a.id) ?? 0;
          return sb - sa;
        });
      }
    }

    const rows = jobsForRows.slice(0, MAX_MATCHES_PER_CANDIDATE).map(job => ({
      candidate_id: candidate.id,
      job_id: job.id,
      fit_score: skillScores?.get(job.id) ? Math.round((skillScores!.get(job.id)! || 0) * 100) : 0,
      match_reason: 'Title match',
      best_resume_id: null,
      matched_keywords: [],
      missing_keywords: [],
      matched_at: now,
      score_breakdown: matchingV3On
        ? { version: 2, title_match: true, skill_overlap: skillScores?.get(job.id) ?? null }
        : { version: 1, title_match: true },
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
    .select('id, title, company, location, salary_min, salary_max, remote_type')
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
      (candidate.target_job_titles || []).some(t => t?.trim()) ||
      (candidate.secondary_titles || []).some(t => t?.trim())
    );
    if (!hasTitles) continue;

    const matchedJobs = (jobs as Job[]).filter(job => {
      if (hiddenByCandidate.get(candidate.id)?.has(job.id)) return false;
      if (!isTitleCompatible(candidate, job)) return false;
      return isTitleMatch(candidate, job);
    });
    if (!matchedJobs.length) continue;

    let jobsForRows = matchedJobs;

    const matchingV3On = await isMatchingV3Enabled(supabase);
    let skillScores: Map<string, number> | null = null;
    if (matchingV3On) {
      skillScores = await computeSkillOverlapScores(supabase, candidate.id, matchedJobs as Job[]);
      if (skillScores && skillScores.size) {
        jobsForRows = [...matchedJobs].sort((a, b) => {
          const sb = skillScores!.get(b.id) ?? 0;
          const sa = skillScores!.get(a.id) ?? 0;
          return sb - sa;
        });
      }
    }

    const rows = jobsForRows.slice(0, MAX_MATCHES_PER_CANDIDATE).map(job => ({
      candidate_id: candidate.id,
      job_id: job.id,
      fit_score: skillScores?.get(job.id) ? Math.round((skillScores!.get(job.id)! || 0) * 100) : 0,
      match_reason: 'Title match',
      best_resume_id: null,
      matched_keywords: [],
      missing_keywords: [],
      matched_at: now,
      score_breakdown: matchingV3On
        ? { version: 2, title_match: true, skill_overlap: skillScores?.get(job.id) ?? null }
        : { version: 1, title_match: true },
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
