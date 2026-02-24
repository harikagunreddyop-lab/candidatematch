import { createServiceClient } from '@/lib/supabase-server';
import { SCORE_MIN_STORED } from '@/lib/ats-score';
import { extractJobRequirements, computeATSScore, type JobRequirements, type ATSScoreResult } from '@/lib/ats-engine';
import { runEliteMatching, matchToDbRow, type EliteJob, type EliteCandidate, type MatchResult } from '@/lib/elite-ats-engine';
import { log as devLog, error as logError } from '@/lib/logger';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CONCURRENCY = 5;
const MAX_MATCHES_PER_CANDIDATE = 50;
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
  if (!jd || jd.length < 50) return null;

  const reqs = await extractJobRequirements(job.title, jd, job.location);
  if (!reqs) return null;

  // Cache on the job record for future runs
  await supabase.from('jobs').update({
    structured_requirements: reqs,
    must_have_skills: reqs.must_have_skills,
    nice_to_have_skills: reqs.nice_to_have_skills,
    seniority_level: reqs.seniority_level,
    min_years_experience: reqs.min_years_experience,
  }).eq('id', job.id);

  return reqs;
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

// ── Main: Run Matching ───────────────────────────────────────────────────────

export async function runMatching(
  candidateId?: string,
  onProgress?: (msg: string) => void,
  options?: { jobsSince?: string },
) {
  if (!ANTHROPIC_API_KEY) throw new Error('API Key missing');

  const supabase = createServiceClient();
  const log = (m: string) => { devLog('[MATCH] ' + m); onProgress?.(m); };

  let q = supabase.from('candidates').select('*').eq('active', true).not('invite_accepted_at', 'is', null);
  if (candidateId) q = q.eq('id', candidateId);
  const { data: candidates, error: cErr } = await q;
  if (cErr) { log('Error fetching candidates: ' + cErr.message); return { candidates_processed: 0, total_matches_upserted: 0, summary: [] }; }
  if (!candidates?.length) { log('No active candidates.'); return { candidates_processed: 0, total_matches_upserted: 0, summary: [] }; }

  let jobQuery = supabase
    .from('jobs')
    .select('id, title, company, location, jd_clean, jd_raw, salary_min, salary_max, structured_requirements, must_have_skills, nice_to_have_skills, seniority_level, min_years_experience')
    .eq('is_active', true);
  if (options?.jobsSince) {
    const sinceDate = new Date(options.jobsSince);
    if (!isNaN(sinceDate.getTime())) {
      jobQuery = jobQuery.gte('created_at', options.jobsSince);
      log(`Incremental mode — only jobs since ${options.jobsSince}`);
    }
  }
  const { data: jobs, error: jErr } = await jobQuery;
  if (jErr) { log('Error fetching jobs: ' + jErr.message); return { candidates_processed: candidates.length, total_matches_upserted: 0, summary: [] }; }
  if (!jobs?.length) { log('No active jobs.'); return { candidates_processed: candidates.length, total_matches_upserted: 0, summary: [] }; }

  const candidateIds = (candidates as Candidate[]).map((c) => c.id);
  const hiddenByCandidate = new Map<string, Set<string>>();
  try {
    const { data: hiddenRows } = await supabase.from('candidate_hidden_jobs').select('candidate_id, job_id').in('candidate_id', candidateIds);
    for (const h of hiddenRows || []) {
      if (!hiddenByCandidate.has(h.candidate_id)) hiddenByCandidate.set(h.candidate_id, new Set());
      hiddenByCandidate.get(h.candidate_id)!.add(h.job_id);
    }
  } catch (_) {}

  log(`Starting: ${candidates.length} candidates × ${jobs.length} jobs (multi-dimensional ATS engine, concurrency=${CONCURRENCY}).`);

  // ── Elite ATS path (Batches API, Claude Sonnet) ─────────────────────────────
  if (process.env.USE_ELITE_ATS === '1' && ANTHROPIC_API_KEY) {
    const logElite = (m: string) => log(m);
    const eliteJobs: EliteJob[] = (jobs as Job[]).map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      description: (j.jd_clean || j.jd_raw || '').trim().slice(0, 5000),
      location: j.location,
      is_active: true,
    }));

    const eliteCandidates: EliteCandidate[] = [];
    for (const candidate of candidates as Candidate[]) {
      const candidateSkills = parseSkills(candidate.skills);
      const candidateExp = parseArray(candidate.experience);
      const candidateEdu = parseArray(candidate.education);
      const hasResumeParsed = (candidate.parsed_resume_text || '').trim().length > 50;
      const profileSignals = [
        candidateSkills.length >= 3,
        candidateExp.length > 0,
        candidateEdu.length > 0,
        hasResumeParsed,
      ].filter(Boolean).length;
      if (profileSignals === 0) continue;

      const variants = await getResumeVariants(supabase, candidate.id, candidate);
      if (variants.every((v) => !v.text.trim())) continue;

      eliteCandidates.push({
        id: candidate.id,
        name: candidate.full_name,
        title: candidate.primary_title,
        years_experience: candidate.years_of_experience,
        location: candidate.location,
        needs_visa_sponsorship: /h1b|opt|visa|sponsorship/i.test((candidate.visa_status || '') + (candidate as any).work_authorization || ''),
        resumes: variants.map((v, i) => ({
          index: i,
          text: v.text,
          resume_id: v.resumeId,
        })),
      });
    }

    if (eliteCandidates.length === 0) {
      log('Elite ATS: No candidates with sufficient profile + resume data.');
      return { candidates_processed: 0, total_matches_upserted: 0, summary: [] };
    }

    try {
      const { matches: eliteMatches, stats } = await runEliteMatching(eliteJobs, eliteCandidates, logElite);

      // Cap at MAX_MATCHES_PER_CANDIDATE per candidate, then upsert
      const byCandidate = new Map<string, typeof eliteMatches>();
      for (const m of eliteMatches) {
        const list = byCandidate.get(m.candidate_id) || [];
        list.push(m);
        byCandidate.set(m.candidate_id, list);
      }
      const toUpsert: any[] = [];
      for (const list of Array.from(byCandidate.values())) {
        const sorted = list.sort((a: MatchResult, b: MatchResult) => b.fit_score - a.fit_score).slice(0, MAX_MATCHES_PER_CANDIDATE);
        for (const m of sorted) {
          if (hiddenByCandidate.get(m.candidate_id)?.has(m.job_id)) continue;
          toUpsert.push(matchToDbRow(m));
        }
      }

      if (toUpsert.length > 0) {
        const { error: upsertErr } = await supabase.from('candidate_job_matches').upsert(toUpsert, { onConflict: 'candidate_id,job_id' });
        if (upsertErr) {
          logError('[MATCH] Elite upsert failed', upsertErr);
          return { candidates_processed: eliteCandidates.length, total_matches_upserted: 0, summary: [] };
        }
      }

      const summary = (candidates as Candidate[]).map((c) => {
        const rows = toUpsert.filter((r: any) => r.candidate_id === c.id);
        const count = rows.length;
        const top_score = count ? Math.max(...rows.map((r: any) => r.fit_score)) : undefined;
        return { candidate_id: c.id, candidate: c.full_name, matches: count, top_score, status: count ? 'Matched' : 'No Matches' };
      });
      log(`Elite ATS complete: ${toUpsert.length} matches upserted.`);
      return {
        candidates_processed: (candidates as Candidate[]).length,
        total_matches_upserted: toUpsert.length,
        summary,
      };
    } catch (e) {
      logError('[MATCH] Elite ATS failed', e);
      return { candidates_processed: (candidates as Candidate[]).length, total_matches_upserted: 0, summary: [] };
    }
  }

  // Phase 0: Extract & cache JD requirements for all jobs (parallel, one-time per job)
  const jobReqMap = new Map<string, JobRequirements | null>();
  const jobsNeedingExtraction = (jobs as Job[]).filter(j => !j.structured_requirements?.must_have_skills);
  if (jobsNeedingExtraction.length > 0) {
    log(`Extracting requirements for ${jobsNeedingExtraction.length} jobs (${jobs.length - jobsNeedingExtraction.length} already cached)...`);
    await runInBatches(jobsNeedingExtraction, CONCURRENCY, async (job) => {
      const reqs = await getOrExtractRequirements(supabase, job);
      jobReqMap.set(job.id, reqs);
    });
  }
  for (const job of jobs as Job[]) {
    if (!jobReqMap.has(job.id)) {
      jobReqMap.set(job.id, (job.structured_requirements as JobRequirements) || null);
    }
  }

  let totalMatchesUpserted = 0;
  const summary: any[] = [];

  for (const candidate of candidates as Candidate[]) {
    // Load resume variants first so we can treat any parseable resume text as a signal,
    // even if the structured profile fields are sparse.
    const variants = await getResumeVariants(supabase, candidate.id, candidate);
    const combinedResumeText = variants.map(v => v.text).join(' ').slice(0, 3000);

    // Profile completeness gate: skip only truly empty profiles (no skills, no exp/edu, no resume text)
    const candidateSkills = parseSkills(candidate.skills);
    const candidateTools = parseSkills(candidate.tools);
    const candidateExp = parseArray(candidate.experience);
    const candidateEdu = parseArray(candidate.education);
    const hasResumeText = variants.some(v => v.text.trim().length > 50);
    const profileSignals = [
      candidateSkills.length >= 3,
      candidateExp.length > 0,
      candidateEdu.length > 0,
      hasResumeText,
    ].filter(Boolean).length;

    if (profileSignals === 0) {
      log(`${candidate.full_name}: Skipped — profile too sparse (no experience, no education, <3 skills, no resume text). Ask candidate to complete their profile or upload a parseable resume.`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'Incomplete Profile' });
      continue;
    }
    const { eligible: potentialJobs, stats } = prefilterJobs(jobs as Job[], candidate, combinedResumeText);

    if (!potentialJobs.length) {
      log(`${candidate.full_name}: No jobs passed filter (accept=${stats.accept}, rejSkill=${stats.rejSkillGate}, rejDomain=${stats.rejDomain})`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'Filtered' });
      continue;
    }
    const candidateCerts = parseArray(candidate.certifications);
    const candidateDomains = getCandidateDomains(candidate);

    // Score each job × each resume variant
    type ScoringTask = { job: Job; resumeId: string | null; resumeText: string };
    const tasks: ScoringTask[] = [];
    for (const job of potentialJobs) {
      for (const v of variants) {
        tasks.push({ job, resumeId: v.resumeId, resumeText: v.text });
      }
    }

    const results = await runInBatches(tasks, CONCURRENCY, async ({ job, resumeId, resumeText }) => {
      const reqs = jobReqMap.get(job.id);
      if (!reqs) {
        return { jobId: job.id, resumeId, score: -1, result: null as ATSScoreResult | null };
      }

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
      return { jobId: job.id, resumeId, score: result.total_score, result };
    });

    // Pick best score per job
    const bestByJob = new Map<string, { score: number; resumeId: string | null; result: ATSScoreResult }>();
    const variantScoresByJob = new Map<string, Array<{ resume_id: string | null; score: number; reason: string }>>();

    for (const r of results) {
      if (!r.result) continue;
      const cur = bestByJob.get(r.jobId);
      if (!cur || r.score > cur.score) {
        bestByJob.set(r.jobId, { score: r.score, resumeId: r.resumeId, result: r.result });
      }
      if (!variantScoresByJob.has(r.jobId)) variantScoresByJob.set(r.jobId, []);
      variantScoresByJob.get(r.jobId)!.push({ resume_id: r.resumeId, score: r.score, reason: r.result.reason });
    }

    const matches: any[] = [];
    const now = new Date().toISOString();

    for (const job of potentialJobs) {
      if (hiddenByCandidate.get(candidate.id)?.has(job.id)) continue;
      const best = bestByJob.get(job.id);
      if (!best || best.score < SCORE_MIN_STORED) continue;

      const d = best.result.dimensions;
      const vScores = (variantScoresByJob.get(job.id) || []).sort((a, b) => b.score - a.score);
      const jobDomain = classifyDomain(job.title);

      matches.push({
        candidate_id: candidate.id,
        job_id: job.id,
        fit_score: best.score,
        match_reason: best.result.reason,
        best_resume_id: best.resumeId,
        matched_keywords: best.result.matched_keywords,
        missing_keywords: best.result.missing_keywords,
        matched_at: now,
        score_breakdown: {
          version: 3,
          dimensions: {
            keyword:    { score: d.keyword.score, details: d.keyword.details, matched: d.keyword.matched, missing: d.keyword.missing },
            experience: { score: d.experience.score, details: d.experience.details },
            title:      { score: d.title.score, details: d.title.details },
            education:  { score: d.education.score, details: d.education.details },
            location:   { score: d.location.score, details: d.location.details },
            formatting: { score: d.formatting.score, details: d.formatting.details },
            behavioral: { score: d.behavioral.score, details: d.behavioral.details },
            soft:       { score: d.soft.score, details: d.soft.details },
          },
          weights: { keyword: 30, experience: 18, title: 14, education: 8, location: 8, formatting: 7, behavioral: 7, soft: 8 },
          variant_scores: vScores,
          candidate_domains: candidateDomains,
          job_domain: jobDomain,
        },
      });
    }

    if (matches.length > 0) {
      matches.sort((a, b) => b.fit_score - a.fit_score);
      const topMatches = matches.slice(0, MAX_MATCHES_PER_CANDIDATE);

      const { error: saveErr } = await supabase
        .from('candidate_job_matches')
        .upsert(topMatches, { onConflict: 'candidate_id,job_id' });

      if (!saveErr) {
        totalMatchesUpserted += topMatches.length;
        const strongCount = topMatches.filter((m: any) => m.fit_score >= 82).length;
        log(`✅ ${candidate.full_name}: ${topMatches.length} matches (${strongCount} strong 82+), top=${topMatches[0]?.fit_score}`);
        summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: topMatches.length, top_score: topMatches[0]?.fit_score, status: 'Matched' });
      } else {
        log(`Save error: ${saveErr.message}`);
        summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'Save Error' });
      }
    } else {
      log(`${candidate.full_name}: 0 matches after multi-dimensional scoring.`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'No Matches Found' });
    }
  }

  return { candidates_processed: (candidates as Candidate[]).length, total_matches_upserted: totalMatchesUpserted, summary };
}
