import { createServiceClient } from '@/lib/supabase-server';
import { SCORE_MIN_STORED } from '@/lib/ats-score';
import { log as devLog, error as logError } from '@/lib/logger';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
/** Number of concurrent ATS API calls (parallel scoring). */
const CONCURRENCY = 12;
/** Max matches stored per candidate (top N by score). Aim for 50+ strong (82+) per day with chunked uploads. */
const MAX_MATCHES_PER_CANDIDATE = 50;
/** Only run resume-variant scoring for jobs where profile-only score >= this (saves API calls). */
const PROFILE_PASS_THRESHOLD = 50;
const MAX_RESUME_TEXT_LEN = 3500;
const MAX_JD_LEN = 1000;

/** Run async tasks in parallel batches of size `concurrency`. */
async function runInBatches<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
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
};

type Candidate = {
  id: string;
  full_name: string;
  primary_title?: string;
  secondary_titles?: string[];
  skills?: any;
  location?: string;
  visa_status?: string;
  parsed_resume_text?: string;
  active: boolean;
};

type ResumeVariant = { resumeId: string | null; text: string };

// ── Domain classification for cross-domain mismatch prevention ──────────────

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
  'general':             ['general', 'software-engineering', 'frontend', 'fullstack', 'data-engineering', 'data-science', 'devops', 'mobile', 'qa', 'security', 'management', 'design'],
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
  for (const t of candidate.secondary_titles || []) {
    domains.add(classifyDomain(t));
  }
  return Array.from(domains);
}

function isDomainCompatible(candidateDomains: Domain[], jobDomain: Domain): boolean {
  if (jobDomain === 'general') return true;
  return candidateDomains.some((cd) => {
    const compatible = DOMAIN_COMPATIBILITY[cd] || DOMAIN_COMPATIBILITY['general'];
    return compatible.includes(jobDomain);
  });
}

// ── Skill parsing ───────────────────────────────────────────────────────────

function parseSkills(skills: any): string[] {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.map(String).filter(Boolean);
  if (typeof skills === 'string') {
    try {
      const parsed = JSON.parse(skills);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return skills.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

/** Extract text from one uploaded resume PDF. Suppresses PDF parser warnings (e.g. TT/font) during extraction. */
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

/**
 * Get all resume variants for a candidate: each uploaded resume + profile-only fallback.
 * Returns array of { resumeId, text } for use in per-job best-resume scoring.
 */
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

  // Fallback: use cached parsed_resume_text on candidate (single variant, no resume id)
  const cached = (candidate.parsed_resume_text || '').trim().slice(0, MAX_RESUME_TEXT_LEN);
  if (cached && !variants.some((v) => v.text.trim() === cached.trim())) {
    variants.push({ resumeId: null, text: cached });
  }

  // If still no variant, use empty so we still score on profile only
  if (variants.length === 0) {
    variants.push({ resumeId: null, text: '' });
  }

  return variants;
}

function buildCandidateContext(candidate: Candidate, resumeText: string): string {
  const skills = parseSkills(candidate.skills).join(', ');
  const titles = [candidate.primary_title, ...(candidate.secondary_titles || [])].filter(Boolean).join(', ');
  return `
    TITLES: ${titles || 'N/A'}
    SKILLS: ${skills || 'N/A'}
    LOCATION: ${candidate.location || 'N/A'}
    VISA: ${candidate.visa_status || 'N/A'}
    ${resumeText ? `RESUME EXCERPT: ${resumeText.slice(0, 1200)}` : ''}
  `.replace(/\s+/g, ' ').trim();
}

/**
 * ATS-style scoring with clear rubric:
 * 82–100: Strong match (keywords, experience, role fit).
 * 75–81: Moderate match (apply with caution).
 * 50–74: Weak match (below apply threshold).
 * 0–49: Poor fit.
 */
async function scoreJobMatch(job: Job, candidateContext: string): Promise<{ score: number; reason: string } | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const salary = job.salary_min
    ? `$${Math.round(job.salary_min / 1000)}k${job.salary_max ? `-$${Math.round(job.salary_max / 1000)}k` : '+'}`
    : 'Not specified';
  const reqText = (job.jd_clean || job.jd_raw || '').slice(0, MAX_JD_LEN);

  const prompt = `You are an ATS (Applicant Tracking System) scorer. Score the candidate–job fit from 0 to 100.

SCORING RULES (use strictly):
- 82–100: Strong match — role, skills and experience align well with the job.
- 75–81: Moderate match — some alignment; candidate may apply with caution.
- 50–74: Weak match — below recommended apply threshold.
- 0–49: Poor fit — major gaps.

DOMAIN ALIGNMENT (critical):
A candidate's career domain must align with the job's domain. If the candidate's core role is fundamentally different from the job (e.g., Java Developer scored against Data Engineer, Frontend Developer against ML Engineer, Backend Developer against Data Scientist), the score MUST be 0–30 regardless of any overlapping keywords like SQL or Python. Shared tools do NOT make incompatible domains compatible.

Return ONLY valid JSON on a single line, no markdown: { "score": <number 0-100>, "reason": "<one short sentence>" }

JOB:
Title: ${job.title}
Company: ${job.company}
Salary: ${salary}
Requirements: ${reqText || 'No JD provided. Base score on title and candidate context.'}

CANDIDATE:
${candidateContext}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.min(100, Math.max(0, parseInt(String(parsed.score), 10) || 0));
    return { score, reason: parsed.reason || 'No reason' };
  } catch {
    return null;
  }
}

/**
 * Pre-filter jobs (no JD required). Uses skills/title/resume hints.
 */
function prefilterJobs(jobs: Job[], candidate: Candidate, combinedResumeText: string): { eligible: Job[]; stats: any } {
  const skills = parseSkills(candidate.skills).map((s) => s.toLowerCase());
  const resumeLower = combinedResumeText.toLowerCase();
  const titleHints = [
    (candidate.primary_title || '').toLowerCase(),
    ...(candidate.secondary_titles || []).map((t) => (t || '').toLowerCase()),
  ].filter(Boolean).join(' ');

  const candidateDomains = getCandidateDomains(candidate);

  const techHints = [
    'java', 'spring', 'python', 'react', 'node', 'sql', 'aws', 'backend', 'frontend',
    'data', 'engineer', 'developer', 'analyst', 'manager', 'full stack', 'devops',
  ];

  let accept = 0;
  let rejNoSignal = 0;
  let rejSkillGate = 0;
  let rejDomain = 0;

  const eligible = jobs.filter((job) => {
    const jd = (job.jd_clean || job.jd_raw || '').toLowerCase().trim();
    const title = (job.title || '').toLowerCase();

    const jobDomain = classifyDomain(job.title);
    if (!isDomainCompatible(candidateDomains, jobDomain)) {
      rejDomain++;
      return false;
    }

    if (jd.length > 80) {
      const hasSkill =
        skills.length ? skills.some((s) => jd.includes(s)) : false;
      const hasResumeSkill = resumeLower.length > 50 && techHints.some((h) => jd.includes(h) && (resumeLower.includes(h) || titleHints.includes(h)));
      if (hasSkill || hasResumeSkill) {
        accept++;
        return true;
      }
      rejSkillGate++;
      return false;
    }

    const hasSignal =
      techHints.some((h) => title.includes(h)) ||
      techHints.some((h) => resumeLower.includes(h)) ||
      techHints.some((h) => titleHints.includes(h));
    if (hasSignal) {
      accept++;
      return true;
    }
    rejNoSignal++;
    return false;
  });

  return { eligible, stats: { accept, rejNoSignal, rejSkillGate, rejDomain } };
}

/**
 * Run matching: for each candidate, score each job using every resume variant,
 * keep the best score and best_resume_id per (candidate, job). Data stays in sync
 * with candidate_job_matches (fit_score, best_resume_id, match_reason).
 */
export async function runMatching(
  candidateId?: string,
  onProgress?: (msg: string) => void,
  options?: { jobsSince?: string },
) {
  if (!ANTHROPIC_API_KEY) throw new Error('API Key missing');

  const supabase = createServiceClient();
  const log = (m: string) => {
    devLog('[MATCH] ' + m);
    onProgress?.(m);
  };

  let q = supabase.from('candidates').select('*').eq('active', true);
  if (candidateId) q = q.eq('id', candidateId);

  const { data: candidates, error: cErr } = await q;
  if (cErr) {
    log('Error fetching candidates: ' + cErr.message);
    return { candidates_processed: 0, total_matches_upserted: 0, summary: [] };
  }
  if (!candidates?.length) {
    log('No active candidates.');
    return { candidates_processed: 0, total_matches_upserted: 0, summary: [] };
  }

  let jobQuery = supabase
    .from('jobs')
    .select('id, title, company, location, jd_clean, jd_raw, salary_min, salary_max')
    .eq('is_active', true);
  if (options?.jobsSince) {
    const sinceDate = new Date(options.jobsSince);
    if (!isNaN(sinceDate.getTime())) {
      jobQuery = jobQuery.gte('created_at', options.jobsSince);
      log(`Incremental mode — only jobs created since ${options.jobsSince}`);
    } else {
      log(`Invalid jobsSince value "${options.jobsSince}" — ignoring filter`);
    }
  }

  const { data: jobs, error: jErr } = await jobQuery;

  if (jErr) {
    log('Error fetching jobs: ' + jErr.message);
    return { candidates_processed: candidates.length, total_matches_upserted: 0, summary: [] };
  }
  if (!jobs?.length) {
    log('No active jobs.');
    return { candidates_processed: candidates.length, total_matches_upserted: 0, summary: [] };
  }

  log(`Starting: ${candidates.length} candidates × ${jobs.length} jobs (profile-first, then resume; parallel concurrency=${CONCURRENCY}).`);

  let totalMatchesUpserted = 0;
  const summary: any[] = [];

  for (const candidate of candidates as Candidate[]) {
    const variants = await getResumeVariants(supabase, candidate.id, candidate);
    const combinedResumeText = variants.map((v) => v.text).join(' ').slice(0, 2000);
    const { eligible: potentialJobs, stats } = prefilterJobs(jobs as Job[], candidate, combinedResumeText);

    if (!potentialJobs.length) {
      log(
        `${candidate.full_name}: No jobs passed filter. (accept=${stats.accept}, rejSkillGate=${stats.rejSkillGate}, rejNoSignal=${stats.rejNoSignal}, rejDomain=${stats.rejDomain || 0})`
      );
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'Filtered' });
      continue;
    }

    const profileOnlyContext = buildCandidateContext(candidate, '');
    const resumeContexts: { resumeId: string | null; context: string }[] = variants.map((v) => ({
      resumeId: v.resumeId,
      context: buildCandidateContext(candidate, v.text),
    }));

    // Phase 1: profile-only scoring (parallel)
    const profileResults = await runInBatches(
      potentialJobs,
      CONCURRENCY,
      async (job) => {
        const res = await scoreJobMatch(job, profileOnlyContext);
        return { job, score: res?.score ?? -1, reason: res?.reason ?? '' };
      }
    );

    const jobProfileMap = new Map<string, { score: number; reason: string }>();
    profileResults.forEach(({ job, score, reason }) => jobProfileMap.set(job.id, { score, reason }));

    const passedJobs = potentialJobs.filter(
      (j) => (jobProfileMap.get(j.id)?.score ?? -1) >= PROFILE_PASS_THRESHOLD
    );

    // Phase 2: resume scoring only for jobs that passed profile (parallel across job×variant)
    type JobCtx = { job: Job; resumeId: string | null; context: string };
    const resumeTasks: JobCtx[] = [];
    for (const job of passedJobs) {
      for (const { resumeId, context } of resumeContexts) {
        resumeTasks.push({ job, resumeId, context });
      }
    }

    const resumeResults = await runInBatches(resumeTasks, CONCURRENCY, async ({ job, resumeId, context }) => {
      const res = await scoreJobMatch(job, context);
      return { jobId: job.id, job, resumeId, score: res?.score ?? -1, reason: res?.reason ?? '' };
    });

    const bestByJob = new Map<
      string,
      { score: number; reason: string; bestResumeId: string | null }
    >();
    const variantScoresByJob = new Map<
      string,
      Array<{ resume_id: string | null; score: number; reason: string }>
    >();
    for (const r of resumeResults) {
      const cur = bestByJob.get(r.jobId);
      if (!cur || r.score > cur.score) {
        bestByJob.set(r.jobId, { score: r.score, reason: r.reason, bestResumeId: r.resumeId });
      }
      if (!variantScoresByJob.has(r.jobId)) variantScoresByJob.set(r.jobId, []);
      variantScoresByJob.get(r.jobId)!.push({ resume_id: r.resumeId, score: r.score, reason: r.reason });
    }

    const candidateDomains = getCandidateDomains(candidate);

    const matches: {
      candidate_id: string; job_id: string; fit_score: number;
      match_reason: string; best_resume_id: string | null;
      matched_at: string; score_breakdown: any;
    }[] = [];
    const now = new Date().toISOString();

    for (const job of potentialJobs) {
      const profile = jobProfileMap.get(job.id);
      const profileScore = profile?.score ?? -1;
      const jobDomain = classifyDomain(job.title);

      if (passedJobs.some((p) => p.id === job.id)) {
        const best = bestByJob.get(job.id);
        const vScores = (variantScoresByJob.get(job.id) || []).sort((a, b) => b.score - a.score);
        if (best && best.score >= SCORE_MIN_STORED) {
          matches.push({
            candidate_id: candidate.id,
            job_id: job.id,
            fit_score: best.score,
            match_reason: best.reason,
            best_resume_id: best.bestResumeId,
            matched_at: now,
            score_breakdown: {
              variant_scores: vScores,
              candidate_domains: candidateDomains,
              job_domain: jobDomain,
            },
          });
        }
      } else if (profileScore >= SCORE_MIN_STORED) {
        matches.push({
          candidate_id: candidate.id,
          job_id: job.id,
          fit_score: profileScore,
          match_reason: profile?.reason ?? 'Profile match',
          best_resume_id: null,
          matched_at: now,
          score_breakdown: {
            profile_only: true,
            variant_scores: [{ resume_id: null, score: profileScore, reason: profile?.reason ?? 'Profile match' }],
            candidate_domains: candidateDomains,
            job_domain: jobDomain,
          },
        });
      }
    }

    if (matches.length > 0) {
      matches.sort((a, b) => b.fit_score - a.fit_score);
      const topMatches = matches.slice(0, MAX_MATCHES_PER_CANDIDATE);

      const { error: saveErr } = await supabase
        .from('candidate_job_matches')
        .upsert(topMatches, { onConflict: 'candidate_id,job_id' });

      if (!saveErr) {
        totalMatchesUpserted += topMatches.length;
        log(`✅ ${candidate.full_name}: ${topMatches.length} matches saved (profile-first, resume for passed).`);
        summary.push({
          candidate_id: candidate.id,
          candidate: candidate.full_name,
          matches: topMatches.length,
          top_score: topMatches[0]?.fit_score ?? null,
          status: 'Matched',
        });
      } else {
        log(`Save error: ${saveErr.message}`);
        summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'Save Error' });
      }
    } else {
      log(`${candidate.full_name}: 0 matches after scoring.`);
      summary.push({ candidate_id: candidate.id, candidate: candidate.full_name, matches: 0, status: 'No Matches Found' });
    }
  }

  return {
    candidates_processed: (candidates as Candidate[]).length,
    total_matches_upserted: totalMatchesUpserted,
    summary,
  };
}
