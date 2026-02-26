import { createServiceClient } from '@/lib/supabase-server';
import { extractJobRequirements, computeATSScore, type JobRequirements, type ATSScoreResult } from '@/lib/ats-engine';
import { log as devLog, error as logError } from '@/lib/logger';

const MAX_MATCHES_PER_CANDIDATE = 500;
const MAX_RESUME_TEXT_LEN = 4000;

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

type ResumeVariant = { resumeId: string | null; text: string };

type ProfileScoreResult = {
  total_score: number;
  reason: string;
  matched_keywords: string[];
  missing_keywords: string[];
  breakdown: {
    skill_score: number;
    title_score: number;
    experience_score: number;
    location_score: number;
    resume_signal_score: number;
    matched_skills: string[];
  };
};

// ── Domain classification ────────────────────────────────────────────────────

type Domain =
  | 'data-engineering' | 'data-science' | 'devops' | 'fullstack'
  | 'frontend' | 'mobile' | 'qa' | 'security'
  | 'management' | 'design' | 'software-engineering' | 'general';

const DOMAIN_COMPATIBILITY: Record<Domain, Domain[]> = {
  'software-engineering': ['software-engineering', 'fullstack', 'frontend', 'general'],
  'frontend':            ['frontend', 'fullstack', 'software-engineering', 'mobile', 'general'],
  'fullstack':           ['fullstack', 'frontend', 'software-engineering', 'mobile', 'general'],
  'data-engineering':    ['data-engineering', 'data-science', 'general'],
  'data-science':        ['data-science', 'data-engineering', 'general'],
  'devops':              ['devops', 'software-engineering', 'general'],
  'mobile':              ['mobile', 'frontend', 'fullstack', 'software-engineering', 'general'],
  'qa':                  ['qa', 'software-engineering', 'general'],
  'security':            ['security', 'devops', 'general'],
  'management':          ['management', 'general'],
  'design':              ['design', 'frontend', 'general'],
  'general':             Object.keys({}) as Domain[], // accepts all
};

function classifyDomain(title: string): Domain {
  const t = (title || '').toLowerCase().trim();
  if (!t) return 'general';
  if (/data\s*(engineer|architect|platform|infrastructure|pipeline|warehouse)|etl\s*(dev|eng)|big\s*data/i.test(t)) return 'data-engineering';
  if (/data\s*(scien|analy)|machine\s*learn|\bml\s*(eng|dev)|\bai\s*(eng|dev)|deep\s*learn|\bnlp\b|computer\s*vision|research\s*scien/i.test(t)) return 'data-science';
  if (/devops|\bsre\b|site\s*reliab|cloud\s*(eng|arch)|platform\s*eng/i.test(t)) return 'devops';
  if (/full[\s-]*stack/i.test(t)) return 'fullstack';
  if (/\bios\s*(dev|eng)|android\s*(dev|eng)|mobile\s*(dev|eng)|react\s*native|flutter/i.test(t)) return 'mobile';
  if (/front[\s-]*end|ui\s*(dev|eng)|react\s*(dev|eng)|angular\s*(dev|eng)|vue\s*(dev|eng)/i.test(t)) return 'frontend';
  if (/\bqa\b|quality\s*assur|test\s*(auto|eng)|\bsdet\b/i.test(t)) return 'qa';
  if (/secur|cyber|infosec|penetration/i.test(t)) return 'security';
  if (/product\s*manag|program\s*manag|project\s*manag|engineering\s*manag|\bscrum\b/i.test(t)) return 'management';
  if (/\bux\b|ui\s*design|product\s*design/i.test(t)) return 'design';
  if (/software|developer|engineer|programmer|back[\s-]*end|java(?!script)|python|\.net|c#|ruby|php|\bnode\b|spring|golang|\bgo\b/i.test(t)) return 'software-engineering';
  return 'general';
}

function getCandidateDomains(candidate: Candidate): Domain[] {
  const domains = new Set<Domain>();
  domains.add(classifyDomain(candidate.primary_title || ''));
  for (const t of candidate.secondary_titles || []) domains.add(classifyDomain(t));
  return Array.from(domains);
}

function isDomainCompatible(candidateDomains: Domain[], jobDomain: Domain): boolean {
  if (jobDomain === 'general') return true;
  return candidateDomains.some(cd => {
    const compatible = DOMAIN_COMPATIBILITY[cd] || [];
    return compatible.includes(jobDomain) || cd === jobDomain;
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

function computeProfileScore(job: Job, candidate: Candidate, resumeText: string): ProfileScoreResult {
  const jobText = canonicalTerm(`${job.title || ''} ${(job.jd_clean || job.jd_raw || '').slice(0, 6000)}`);
  const jobTitle = canonicalTerm(job.title || '');

  const skills = [...parseSkills(candidate.skills), ...(candidate.tools || [])]
    .map(canonicalTerm)
    .filter(Boolean);
  const uniqueSkills = Array.from(new Set(skills)).filter(s => s.length >= 2);

  const matchedSkills = uniqueSkills.filter(s => jobText.includes(s)).slice(0, 20);

  const must = (job.must_have_skills || []).map(canonicalTerm).filter(Boolean);
  const missing = must.length
    ? must.filter(s => !matchedSkills.includes(s)).slice(0, 10)
    : [];

  const denom = Math.max(5, Math.min(12, uniqueSkills.length || 5));
  const skillScore = Math.max(0, Math.min(60, Math.round((matchedSkills.length / denom) * 60)));

  const candidateDomains = getCandidateDomains(candidate);
  const jobDomain = classifyDomain(job.title);
  const domainOk = isDomainCompatible(candidateDomains, jobDomain);

  const titleTokens = Array.from(new Set(
    [candidate.primary_title, ...(candidate.secondary_titles || [])]
      .map(t => canonicalTerm(t || ''))
      .join(' ')
      .split(' ')
      .filter(t => t.length >= 4)
  ));
  const titleOverlap = titleTokens.filter(t => jobTitle.includes(t)).length;
  const titleScore = Math.max(0, Math.min(20, (domainOk ? 10 : 0) + (titleOverlap > 0 ? 10 : 0)));

  const jobMin = typeof job.min_years_experience === 'number' ? job.min_years_experience : null;
  const candYears = typeof candidate.years_of_experience === 'number' ? candidate.years_of_experience : null;
  let experienceScore = 5;
  if (jobMin !== null && candYears !== null) {
    if (candYears >= jobMin) experienceScore = 10;
    else experienceScore = Math.max(0, Math.min(10, Math.round((candYears / Math.max(1, jobMin)) * 10)));
  }

  const remoteType = canonicalTerm((job as any).remote_type || '');
  const openRemote = (candidate as any).open_to_remote ?? true;
  const openRelocate = (candidate as any).open_to_relocation ?? false;
  let locationScore = 0;
  if (remoteType.includes('remote') && openRemote) locationScore = 10;
  else if (remoteType.includes('hybrid') && (openRemote || openRelocate)) locationScore = 6;
  else if (remoteType.includes('onsite') && openRelocate) locationScore = 6;

  const resumeSignalScore = (resumeText || '').trim().length >= 300 ? 5 : 0;

  const total = Math.max(0, Math.min(
    100,
    Math.round(skillScore + titleScore + experienceScore + locationScore + resumeSignalScore)
  ));

  const matchedKeywords = matchedSkills.slice(0, 8);
  const missingKeywords = missing.slice(0, 6);

  const reason = [
    `Profile match ${total}`,
    matchedKeywords.length ? `matched: ${matchedKeywords.slice(0, 5).join(', ')}` : 'matched: —',
    candYears !== null ? `exp: ${candYears}y` : null,
  ].filter(Boolean).join(' · ');

  return {
    total_score: total,
    reason,
    matched_keywords: matchedKeywords,
    missing_keywords: missingKeywords,
    breakdown: {
      skill_score: skillScore,
      title_score: titleScore,
      experience_score: experienceScore,
      location_score: locationScore,
      resume_signal_score: resumeSignalScore,
      matched_skills: matchedSkills.slice(0, 12),
    },
  };
}

// ── Resume extraction ────────────────────────────────────────────────────────

async function getResumeTextFromStorage(supabase: any, pdfPath: string): Promise<string> {
  try {
    const { data, error } = await supabase.storage.from('resumes').download(pdfPath);
    if (error || !data) return '';
    const arrayBuffer = await data.arrayBuffer();
    const { extractText } = await import('unpdf');
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = args[0];
      if (typeof msg === 'string' && (msg.includes('TT:') || msg.includes('undefined function') || msg.includes('invalid function id'))) return;
      origWarn.apply(console, args);
    };
    try {
      const { text } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
      return (text || '').slice(0, MAX_RESUME_TEXT_LEN);
    } finally {
      console.warn = origWarn;
    }
  } catch (e) {
    logError('[matching] PDF extraction failed', e);
    return '';
  }
}

async function getResumeVariants(supabase: any, candidateId: string, candidate: Candidate): Promise<ResumeVariant[]> {
  const { data: resumes } = await supabase
    .from('candidate_resumes')
    .select('id, pdf_path')
    .eq('candidate_id', candidateId)
    .order('uploaded_at', { ascending: false });

  const variants: ResumeVariant[] = [];
  if (resumes?.length) {
    for (const r of resumes) {
      const text = await getResumeTextFromStorage(supabase, r.pdf_path);
      variants.push({ resumeId: r.id, text });
    }
  }

  const cached = (candidate.parsed_resume_text || '').trim().slice(0, MAX_RESUME_TEXT_LEN);
  if (cached && !variants.some(v => v.text.trim() === cached.trim())) {
    variants.push({ resumeId: null, text: cached });
  }

  if (variants.length === 0) {
    variants.push({ resumeId: null, text: '' });
  }

  return variants;
}

// ── JD Requirements: extract once & cache ────────────────────────────────────

async function getOrExtractRequirements(supabase: any, job: Job): Promise<JobRequirements | null> {
  if (job.structured_requirements && typeof job.structured_requirements === 'object' && job.structured_requirements.must_have_skills) {
    return job.structured_requirements as JobRequirements;
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
): Promise<{ ats_score: number; ats_reason: string; ats_breakdown: any; ats_resume_id: string | null; ats_checked_at: string }> {
  const now = new Date().toISOString();

  const [{ data: candidate, error: candErr }, { data: job, error: jobErr }] = await Promise.all([
    supabase.from('candidates').select('*').eq('id', candidateId).single(),
    supabase.from('jobs').select('*').eq('id', jobId).single(),
  ]);
  if (candErr || !candidate) throw new Error(candErr?.message || 'Candidate not found');
  if (jobErr || !job) throw new Error(jobErr?.message || 'Job not found');

  // Pick resume text: explicit resumeId → match.best_resume_id → latest candidate resume → parsed_resume_text
  let chosenResumeId: string | null = resumeId ?? null;
  if (!chosenResumeId) {
    const { data: matchRow } = await supabase
      .from('candidate_job_matches')
      .select('best_resume_id')
      .eq('candidate_id', candidateId)
      .eq('job_id', jobId)
      .single();
    chosenResumeId = matchRow?.best_resume_id ?? null;
  }

  let resumeText = '';
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
  if (!resumeText) {
    resumeText = (candidate.parsed_resume_text || '').slice(0, MAX_RESUME_TEXT_LEN);
    chosenResumeId = chosenResumeId ?? null;
  }

  const reqs = await getOrExtractRequirements(supabase, job as Job);
  if (!reqs) throw new Error('Could not extract job requirements');

  const candidateSkills = parseSkills(candidate.skills);
  const candidateTools = parseSkills(candidate.tools);
  const candidateExp = parseArray(candidate.experience);
  const candidateEdu = parseArray(candidate.education);
  const candidateCerts = parseArray(candidate.certifications);

  const candidateData = {
    primary_title: candidate.primary_title,
    secondary_titles: candidate.secondary_titles || [],
    skills: candidateSkills,
    tools: candidateTools,
    experience: candidateExp,
    education: candidateEdu,
    certifications: candidateCerts,
    location: candidate.location,
    visa_status: candidate.visa_status,
    years_of_experience: candidate.years_of_experience,
    open_to_remote: (candidate as any).open_to_remote ?? true,
    open_to_relocation: (candidate as any).open_to_relocation ?? false,
    target_locations: (candidate as any).target_locations || [],
    resume_text: resumeText,
  };

  const jd = (job.jd_clean || job.jd_raw || '').trim();
  const result = await computeATSScore(job.title, jd, reqs, candidateData);

  const atsRow = {
    ats_score: result.total_score,
    ats_reason: result.reason,
    ats_breakdown: { dimensions: result.dimensions },
    ats_checked_at: now,
    ats_resume_id: chosenResumeId,
  };

  await supabase
    .from('candidate_job_matches')
    .upsert([{ candidate_id: candidateId, job_id: jobId, ...atsRow }], { onConflict: 'candidate_id,job_id' });

  return { ats_score: result.total_score, ats_reason: result.reason, ats_breakdown: atsRow.ats_breakdown, ats_resume_id: chosenResumeId, ats_checked_at: now };
}

// ── Pre-filter (fast, no API calls) ──────────────────────────────────────────

function prefilterJobs(jobs: Job[], candidate: Candidate, combinedResumeText: string): { eligible: Job[]; stats: any } {
  const skills = parseSkills(candidate.skills).map(s => s.toLowerCase());
  const resumeLower = combinedResumeText.toLowerCase();
  const titleHints = [
    (candidate.primary_title || '').toLowerCase(),
    ...(candidate.secondary_titles || []).map(t => (t || '').toLowerCase()),
  ].filter(Boolean).join(' ');

  const candidateDomains = getCandidateDomains(candidate);

  const techHints = [
    'java', 'spring', 'python', 'react', 'node', 'sql', 'aws', 'backend', 'frontend',
    'data', 'engineer', 'developer', 'analyst', 'manager', 'full stack', 'devops',
    'kubernetes', 'docker', 'cloud', 'machine learning', 'typescript', 'angular', 'vue',
  ];

  let accept = 0, rejNoSignal = 0, rejSkillGate = 0, rejDomain = 0;

  const eligible = jobs.filter(job => {
    const jd = (job.jd_clean || job.jd_raw || '').toLowerCase().trim();
    const jobDomain = classifyDomain(job.title);
    if (!isDomainCompatible(candidateDomains, jobDomain)) { rejDomain++; return false; }

    if (jd.length > 80) {
      const hasSkill = skills.length ? skills.some(s => jd.includes(s)) : false;
      const hasResumeSkill = resumeLower.length > 50 && techHints.some(h => jd.includes(h) && (resumeLower.includes(h) || titleHints.includes(h)));
      if (hasSkill || hasResumeSkill) { accept++; return true; }
      rejSkillGate++;
      return false;
    }

    const title = (job.title || '').toLowerCase();
    const hasSignal = techHints.some(h => title.includes(h)) || techHints.some(h => resumeLower.includes(h)) || techHints.some(h => titleHints.includes(h));
    if (hasSignal) { accept++; return true; }
    rejNoSignal++;
    return false;
  });

  return { eligible, stats: { accept, rejNoSignal, rejSkillGate, rejDomain } };
}

// ── Title-based matching (no score, no LLM) ──────────────────────────────────

/**
 * Normalises a job title string into a set of lowercase tokens for fuzzy matching.
 * Short tokens (< 3 chars) are excluded unless they are known abbreviations.
 */
const KEEP_SHORT = new Set(['qa', 'ai', 'ml', 'bi', 'ux', 'pm', 'vp', 'cto', 'ceo', 'cfo', 'sre']);

function titleTokens(title: string): string[] {
  const clean = canonicalTerm(title);
  return Array.from(new Set(clean.split(/\s+/).filter(t => t.length >= 3 || KEEP_SHORT.has(t))));
}

/**
 * Returns true when the candidate's title pool (primary + secondary + target)
 * has meaningful overlap with the job title.
 *
 * Match criteria (any one sufficient):
 *  1. At least 1 non-trivial token shared between any candidate title and job title
 *  2. Domain is compatible between any candidate title and job title
 */
const TRIVIAL_TOKENS = new Set(['senior', 'junior', 'lead', 'staff', 'principal', 'associate', 'head', 'director', 'manager', 'engineer', 'developer', 'specialist', 'consultant']);

function isTitleMatch(candidate: Candidate, job: Job): boolean {
  const candidateTitles = [
    candidate.primary_title || '',
    ...(candidate.secondary_titles || []),
    ...(candidate.target_job_titles || []),
  ].filter(Boolean);

  if (candidateTitles.length === 0) return false;

  const jobToksArr = titleTokens(job.title);
  const jobToksSet = new Set(jobToksArr);
  const jobDomain = classifyDomain(job.title);

  for (const ct of candidateTitles) {
    const cdDomain = classifyDomain(ct);
    if (isDomainCompatible([cdDomain], jobDomain)) return true;

    const ctToks = titleTokens(ct);
    for (const tok of ctToks) {
      if (!TRIVIAL_TOKENS.has(tok) && tok.length >= 3 && jobToksSet.has(tok)) return true;
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
  } catch (_) {}

  log(`Title-based matching: ${candidates.length} candidates × ${jobs.length} jobs.`);

  let totalMatchesUpserted = 0;
  const summary: any[] = [];
  const now = new Date().toISOString();

  for (const candidate of candidates as Candidate[]) {
    const hasTitles = !!(
      candidate.primary_title?.trim() ||
      (candidate.secondary_titles || []).some(t => t?.trim()) ||
      (candidate.target_job_titles || []).some(t => t?.trim())
    );

    if (!hasTitles) {
      log(`${candidate.full_name}: Skipped — no titles set (primary, secondary, or target).`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'No Titles' });
      continue;
    }

    const matchedJobs = (jobs as Job[]).filter(job => {
      if (hiddenByCandidate.get(candidate.id)?.has(job.id)) return false;
      return isTitleMatch(candidate, job);
    });

    if (matchedJobs.length === 0) {
      log(`${candidate.full_name}: 0 title-matched jobs.`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'No Matches Found' });
      continue;
    }

    const rows = matchedJobs.slice(0, MAX_MATCHES_PER_CANDIDATE).map(job => ({
      candidate_id: candidate.id,
      job_id: job.id,
      fit_score: 0,
      match_reason: 'Title match',
      best_resume_id: null,
      matched_keywords: [],
      missing_keywords: [],
      matched_at: now,
      score_breakdown: { version: 1, title_match: true },
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
  } catch (_) {}

  let totalMatchesUpserted = 0;
  const summary: any[] = [];
  const now = new Date().toISOString();

  for (const candidate of candidates as Candidate[]) {
    const hasTitles = !!(
      candidate.primary_title?.trim() ||
      (candidate.secondary_titles || []).some(t => t?.trim()) ||
      (candidate.target_job_titles || []).some(t => t?.trim())
    );
    if (!hasTitles) continue;

    const matchedJobs = (jobs as Job[]).filter(job => {
      if (hiddenByCandidate.get(candidate.id)?.has(job.id)) return false;
      return isTitleMatch(candidate, job);
    });
    if (!matchedJobs.length) continue;

    const rows = matchedJobs.map(job => ({
      candidate_id: candidate.id,
      job_id: job.id,
      fit_score: 0,
      match_reason: 'Title match',
      best_resume_id: null,
      matched_keywords: [],
      missing_keywords: [],
      matched_at: now,
      score_breakdown: { version: 1, title_match: true },
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
