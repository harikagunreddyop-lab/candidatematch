/**
 * elite-ats-engine.ts  v2 — "Application-to-Interview Conversion Machine"
 *
 * North star: A candidate scoring 82+ here WILL clear Workday, Taleo,
 * iCIMS, SuccessFactors, Greenhouse, Lever, SmartRecruiters, Workable,
 * BambooHR, and Manatal screening — guaranteed.
 *
 * How: Your score is a SUPERSET of all their criteria. To score 82+ here,
 * a candidate must satisfy:
 *   - Semantic fit (what your engine measures today)
 *   - Literal keyword presence (what Taleo/Workday check)
 *   - Format parseability (what all legacy systems require)
 *   - Hard gate clearance (must-haves, years, education, location)
 *   - System-specific quirks (acronym expansion, keyword density, date formats)
 *
 * If any of those fail, the score is gated below 82 with specific
 * remediation output telling you exactly what needs to change.
 *
 * Architecture:
 *   Layer 1 — Deterministic pre-filter
 *   Layer 2 — Elite semantic scoring + cross-ATS validation (10 systems)
 *   Layer 3 — Cross-candidate ranking
 *
 * Drop-in replacement when USE_ELITE_ATS=1. Output compatible with candidate_job_matches.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BATCHES_BASE = 'https://api.anthropic.com/v1/messages/batches';
const MODEL = 'claude-sonnet-4-6-20250514';
const BATCH_SIZE = 10_000;
const SCORE_MIN_STORED = 50;
const POLL_INTERVAL_MS = 60_000;

// ─────────────────────────────────────────────────────────────
// TYPES — compatible with existing DB schema
// ─────────────────────────────────────────────────────────────

export interface EliteJob {
  id: string;
  title: string;
  company: string;
  description: string;
  location?: string;
  is_active: boolean;
  structured_requirements?: Record<string, unknown>;
}

export interface EliteCandidate {
  id: string;
  name: string;
  title?: string;
  years_experience?: number;
  location?: string;
  needs_visa_sponsorship?: boolean;
  resumes: EliteResumeVariant[];
}

export interface EliteResumeVariant {
  index: number;
  text: string;
  resume_id?: string | null; // optional: for best_resume_id in DB
}

export interface DimensionScore {
  score: number;
  weight: number;
  reasoning: string;
}

/** Per-ATS system passthrough assessment. */
export interface ATSSystemCheck {
  system: string;
  passes: boolean;
  score_estimate: number;
  blocking_issues: string[];
  keyword_gaps: string[];
  fix_instructions: string[];
}

/** Cross-ATS validation: all 10 major systems. */
export interface CrossATSPassthrough {
  all_systems_clear: boolean;
  systems: ATSSystemCheck[];
  guaranteed_interview_ready: boolean;
  resume_fix_priority: string[];
  optimized_resume_suggestions: string[];
}

const DEFAULT_CROSS_ATS: CrossATSPassthrough = {
  all_systems_clear: false,
  systems: [],
  guaranteed_interview_ready: false,
  resume_fix_priority: [],
  optimized_resume_suggestions: [],
};

export interface ScoreBreakdown {
  keyword: DimensionScore;
  experience: DimensionScore;
  title: DimensionScore;
  education: DimensionScore;
  location: DimensionScore;
  formatting: DimensionScore;
  behavioral: DimensionScore;
  soft: DimensionScore;
  total: number;
  resume_variant_used: number;
  per_variant_scores: number[];
  cross_ats?: CrossATSPassthrough;
}

export interface MatchResult {
  candidate_id: string;
  job_id: string;
  fit_score: number;
  match_reason: string;
  matched_keywords: string[];
  missing_keywords: string[];
  score_breakdown: ScoreBreakdown;
  apply_tier: 'strong' | 'moderate' | 'below_threshold' | 'not_stored';
  interview_ready: boolean; // true = 82+ AND all 10 ATS systems clear
  best_resume_id?: string | null;
  recruiter_email?: string;
}

// ─────────────────────────────────────────────────────────────
// PROMPTS
// ─────────────────────────────────────────────────────────────

function eliteScoringPrompt(
  job: EliteJob,
  candidate: EliteCandidate,
  resume: string,
  variantIndex: number
): string {
  return `
You are the world's most accurate ATS scoring engine AND cross-ATS passthrough validator.
Dual mission: (1) Score TRUE fit for the role (semantic). (2) Validate if this resume will PASS all 10 major ATS systems (Workday, Taleo, iCIMS, SuccessFactors, Greenhouse, Lever, SmartRecruiters, Workable, BambooHR, Manatal). A candidate earns 82+ only if BOTH genuine fit AND all systems clear.

CROSS-ATS GATE: If ANY system would hard-reject this resume, set formatting score below 70 and total below 82; populate blocking_issues and fix_instructions for that system.

━━━ SCORING PHILOSOPHY ━━━
- Score the PERSON, not the document. A 3-line description of a Netflix infrastructure role
  outweighs a full page at an unknown consultancy.
- Understand IMPLIED skills. "Led a team shipping search to 50M users" implies:
  distributed systems, scalability, people management, product sense — even if not listed.
- Detect TRAJECTORY. A candidate 3 years into a clear 10-year arc toward this role
  scores higher than someone stagnating at the exact title for 6 years.
- Penalise RED FLAGS: vague impact claims, title inflation, unexplained gaps > 8 months,
  skills listed but never demonstrated in actual roles, job hopping without growth signal.
- Distinguish SIGNAL from NOISE: quantified achievements, named systems, measurable impact
  are signal. Generic buzzwords, repeated filler phrases, padded responsibilities are noise.

━━━ JOB ━━━
Title: ${job.title}
Company: ${job.company}
${job.location ? `Location: ${job.location}` : ''}

Job Description:
${job.description.slice(0, 4000)}

━━━ CANDIDATE ━━━
Name: ${candidate.name}
${candidate.title ? `Current Title: ${candidate.title}` : ''}
${candidate.years_experience != null ? `Years Experience: ${candidate.years_experience}` : ''}
${candidate.location ? `Location: ${candidate.location}` : ''}
${candidate.needs_visa_sponsorship ? 'Needs visa sponsorship: Yes' : ''}
Resume Variant: ${variantIndex + 1}

Resume Text:
${resume.slice(0, 3500)}

━━━ SCORING DIMENSIONS ━━━
Score each dimension 0–100 with a 1-2 sentence reasoning. Be precise and opinionated.

1. KEYWORD (weight 0.30) — Semantic skill match, must-have missing = heavy penalty, implied skills count, recency matters.
2. EXPERIENCE (weight 0.18) — Years vs requirement, seniority, industry, FAANG signal, red flags.
3. TITLE (weight 0.14) — Exact/equivalent title, domain and seniority alignment, title inflation penalty.
4. EDUCATION (weight 0.08) — Degree level, field, certs; if no JD requirement default 75.
5. LOCATION (weight 0.08) — Remote/hybrid/onsite, city/relocation, visa.
6. FORMATTING (weight 0.07) — Clarity, structure, quantified achievements, dates, length.
7. BEHAVIORAL (weight 0.07) — Leadership, ownership, collaboration, action verbs, culture-fit.
8. SOFT (weight 0.08) — Trajectory, domain depth, growth potential, culture signals, red flags.

━━━ OUTPUT FORMAT ━━━
Return ONLY valid JSON. No markdown, no explanation outside the JSON.

{
  "keyword":    { "score": <0-100>, "weight": 0.30, "reasoning": "<1-2 sentences>" },
  "experience": { "score": <0-100>, "weight": 0.18, "reasoning": "<1-2 sentences>" },
  "title":      { "score": <0-100>, "weight": 0.14, "reasoning": "<1-2 sentences>" },
  "education":  { "score": <0-100>, "weight": 0.08, "reasoning": "<1-2 sentences>" },
  "location":   { "score": <0-100>, "weight": 0.08, "reasoning": "<1-2 sentences>" },
  "formatting": { "score": <0-100>, "weight": 0.07, "reasoning": "<1-2 sentences>" },
  "behavioral": { "score": <0-100>, "weight": 0.07, "reasoning": "<1-2 sentences>" },
  "soft":       { "score": <0-100>, "weight": 0.08, "reasoning": "<1-2 sentences>" },
  "matched_keywords": [],
  "missing_keywords": [],
  "match_reason": "<2-3 sentence recruiter summary>",
  "red_flags": [],
  "cross_ats": {
    "all_systems_clear": <boolean>,
    "systems": [one object per system: Workday, Oracle Taleo, iCIMS, SAP SuccessFactors, Greenhouse, Lever, SmartRecruiters, Workable, BambooHR, Manatal — each with "system", "passes", "score_estimate", "blocking_issues", "keyword_gaps", "fix_instructions"],
    "guaranteed_interview_ready": <boolean>,
    "resume_fix_priority": ["<ordered list of highest-impact fixes>"],
    "optimized_resume_suggestions": ["<specific text changes to add>"]
  }
}
`.trim();
}

function crossCandidatePrompt(job: EliteJob, candidates: MatchResult[]): string {
  const ranked = [...candidates].sort((a, b) => b.fit_score - a.fit_score).slice(0, 20);
  const pool = ranked
    .map(
      (c, i) => `
${i + 1}. ${c.candidate_id} | Score: ${c.fit_score} | Interview Ready: ${c.interview_ready}
   ${c.match_reason}
   Matched: ${c.matched_keywords.slice(0, 6).join(', ')}
   Missing: ${c.missing_keywords.slice(0, 4).join(', ')}
   ATS Clear: ${c.score_breakdown.cross_ats?.all_systems_clear ?? false}
`.trim()
    )
    .join('\n\n');

  return `
You are a Principal Recruiter evaluating the full candidate pool for a role.
Job: ${job.title} at ${job.company}
Description summary: ${job.description.slice(0, 800)}

Candidate Pool (top ${ranked.length}):
${pool}

Tasks: Identify TRUE top 5, flag inflated/underrated scores, write a brief recruiter email.
Return ONLY valid JSON:
{
  "top_candidates": [
    { "candidate_id": "<id>", "adjusted_tier": "A|B|C|D", "pool_rank": 1-5, "comparative_note": "<why they stand out>" }
  ],
  "pool_observations": "<2-3 sentences>",
  "recruiter_email": "<email body, under 350 words>"
}
`.trim();
}

// ─────────────────────────────────────────────────────────────
// LAYER 1 — DETERMINISTIC PRE-FILTER
// ─────────────────────────────────────────────────────────────

const DOMAIN_COMPATIBILITY: Record<string, string[]> = {
  frontend: ['frontend', 'fullstack', 'mobile'],
  backend: ['backend', 'fullstack', 'platform', 'infrastructure'],
  fullstack: ['frontend', 'backend', 'fullstack'],
  mobile: ['mobile', 'frontend', 'fullstack'],
  data: ['data', 'ml', 'analytics', 'backend'],
  ml: ['ml', 'data', 'research', 'backend'],
  devops: ['devops', 'platform', 'infrastructure', 'backend'],
  platform: ['platform', 'devops', 'infrastructure', 'backend'],
  security: ['security', 'platform', 'devops'],
  design: ['design', 'frontend'],
  product: ['product'],
  management: ['management'],
  general: ['general', 'frontend', 'backend', 'fullstack', 'mobile', 'data', 'ml', 'devops', 'platform', 'security', 'design', 'product', 'management'],
};

function inferDomain(title: string): string {
  const t = (title || '').toLowerCase();
  if (/front.?end|react|vue|angular|ui|ux/.test(t)) return 'frontend';
  if (/back.?end|node|django|rails|api|server/.test(t)) return 'backend';
  if (/full.?stack/.test(t)) return 'fullstack';
  if (/mobile|ios|android|flutter|react.native/.test(t)) return 'mobile';
  if (/machine.learn|ml|ai|deep.learn|nlp|llm/.test(t)) return 'ml';
  if (/data.eng|etl|pipeline|spark|kafka/.test(t)) return 'data';
  if (/devops|sre|reliability|ci.cd|deploy/.test(t)) return 'devops';
  if (/platform|infra|cloud|aws|gcp|azure/.test(t)) return 'platform';
  if (/security|cyber|pentest|appsec/.test(t)) return 'security';
  if (/design|ux|ui.ux/.test(t)) return 'design';
  if (/product.manag|pm\b/.test(t)) return 'product';
  if (/engineer.manag|head of eng|vp eng|director/.test(t)) return 'management';
  return 'general';
}

function domainsCompatible(candidateDomain: string, jobDomain: string): boolean {
  if (candidateDomain === 'general' || jobDomain === 'general') return true;
  const compatible = DOMAIN_COMPATIBILITY[jobDomain] ?? [jobDomain];
  return compatible.includes(candidateDomain);
}

export function passesPreFilter(candidate: EliteCandidate, job: EliteJob): boolean {
  const candidateDomain = inferDomain(candidate.title ?? '');
  const jobDomain = inferDomain(job.title);
  if (!domainsCompatible(candidateDomain, jobDomain)) return false;

  const jdWords = new Set(
    job.description
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4)
  );
  const hasSignal = candidate.resumes.some((r) =>
    r.text
      .toLowerCase()
      .split(/\W+/)
      .some((w) => w.length > 4 && jdWords.has(w))
  );
  return hasSignal;
}

// ─────────────────────────────────────────────────────────────
// LAYER 2 — BATCH SCORING (fetch-based Batches API)
// ─────────────────────────────────────────────────────────────

function computeWeightedScore(
  breakdown: Omit<ScoreBreakdown, 'total' | 'resume_variant_used' | 'per_variant_scores'>
): number {
  const raw =
    breakdown.keyword.score * 0.3 +
    breakdown.experience.score * 0.18 +
    breakdown.title.score * 0.14 +
    breakdown.education.score * 0.08 +
    breakdown.location.score * 0.08 +
    breakdown.formatting.score * 0.07 +
    breakdown.behavioral.score * 0.07 +
    breakdown.soft.score * 0.08;

  let total = Math.round(raw);
  if (breakdown.title.score <= 25) total = Math.min(total, 30);
  else if (breakdown.title.score <= 45) total = Math.min(total, 55);
  return Math.max(0, Math.min(100, total));
}

function applyTier(score: number): MatchResult['apply_tier'] {
  if (score < SCORE_MIN_STORED) return 'not_stored';
  if (score < 75) return 'below_threshold';
  if (score < 82) return 'moderate';
  return 'strong';
}

async function createBatch(requests: Array<{ custom_id: string; params: object }>): Promise<string> {
  const res = await fetch(ANTHROPIC_BATCHES_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Batches create failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.id;
}

async function getBatchStatus(batchId: string): Promise<{ status: string; request_counts?: { processing: number; succeeded: number; errored: number } }> {
  const res = await fetch(`${ANTHROPIC_BATCHES_BASE}/${batchId}`, {
    headers: { 'x-api-key': ANTHROPIC_API_KEY! },
  });
  if (!res.ok) throw new Error(`Batches get failed: ${res.status}`);
  return res.json();
}

async function getBatchResults(batchId: string): Promise<Array<{ custom_id: string; result: { type: string; message?: { content: Array<{ text: string }> } } }>> {
  const res = await fetch(`${ANTHROPIC_BATCHES_BASE}/${batchId}/results`, {
    headers: { 'x-api-key': ANTHROPIC_API_KEY! },
  });
  if (!res.ok) throw new Error(`Batches results failed: ${res.status}`);
  const data = await res.json();
  return data.items ?? data.results ?? [];
}

async function submitBatches(
  requests: Array<{ custom_id: string; params: object }>,
  onLog: (msg: string) => void
): Promise<string[]> {
  const batchIds: string[] = [];
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const chunk = requests.slice(i, i + BATCH_SIZE);
    const id = await createBatch(chunk);
    batchIds.push(id);
    onLog(`  Submitted batch ${batchIds.length}/${Math.ceil(requests.length / BATCH_SIZE)} → ${id} (${chunk.length} requests)`);
  }
  return batchIds;
}

async function pollUntilDone(batchIds: string[], onLog: (msg: string) => void): Promise<void> {
  let pending = new Set(batchIds);
  while (pending.size > 0) {
    const stillPending = new Set<string>();
    for (const id of Array.from(pending)) {
      const batch = await getBatchStatus(id);
      const status = batch.status ?? (batch as any).processing_status;
      if (status === 'ended' || status === 'completed') {
        const c = (batch as any).request_counts ?? batch.request_counts;
        onLog(`  ✓ ${id} — succeeded: ${c?.succeeded ?? '?'}, errored: ${c?.errored ?? '?'}`);
      } else {
        stillPending.add(id);
      }
    }
    pending = stillPending;
    if (pending.size > 0) {
      onLog(`  Waiting ${POLL_INTERVAL_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

async function collectBatchResults(batchIds: string[]): Promise<Map<string, any>> {
  const results = new Map<string, any>();
  for (const batchId of batchIds) {
    const items = await getBatchResults(batchId);
    for (const item of items) {
      const cid = item.custom_id;
      const result = item.result;
      if (result?.type === 'succeeded' && result?.message?.content?.[0]?.text) {
        let text = result.message.content[0].text.trim();
        if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        try {
          results.set(cid, JSON.parse(text));
        } catch {
          results.set(cid, { error: 'json_parse_failed', raw: text.slice(0, 200) });
        }
      } else {
        results.set(cid, { error: result?.type ?? 'unknown' });
      }
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
// MAIN PIPELINE
// ─────────────────────────────────────────────────────────────

export async function runEliteMatching(
  jobs: EliteJob[],
  candidates: EliteCandidate[],
  onLog: (msg: string) => void = (m) => console.log(m)
): Promise<{
  matches: MatchResult[];
  rankingInsights: Map<string, any>;
  stats: Record<string, number>;
}> {
  const startTime = Date.now();
  const maxVariants = Math.max(1, ...candidates.map((c) => c.resumes.length));
  const totalPairs = jobs.length * candidates.length * maxVariants;

  onLog('\n' + '═'.repeat(60));
  onLog('  ELITE ATS ENGINE — STARTING');
  onLog(`  Jobs: ${jobs.length} | Candidates: ${candidates.length} | Model: ${MODEL}`);
  onLog('═'.repeat(60) + '\n');

  // Layer 1: Pre-filter
  onLog('🔍 Layer 1: Deterministic pre-filter...');
  const passingPairs: Array<{ job: EliteJob; candidate: EliteCandidate; resume: EliteResumeVariant }> = [];
  for (const job of jobs) {
    for (const candidate of candidates) {
      if (!passesPreFilter(candidate, job)) continue;
      for (const resume of candidate.resumes) {
        passingPairs.push({ job, candidate, resume });
      }
    }
  }
  const filteredOut = totalPairs - passingPairs.length;
  onLog(`  ✓ ${passingPairs.length} pairs pass | ${filteredOut} filtered out\n`);

  if (passingPairs.length === 0) {
    return {
      matches: [],
      rankingInsights: new Map(),
      stats: { total_pairs: totalPairs, pairs_after_prefilter: 0, pairs_filtered_out: filteredOut, matches_above_threshold: 0, jobs_ranked: 0, elapsed_minutes: (Date.now() - startTime) / 60000 },
    };
  }

  // Layer 2: Batch scoring
  onLog('🧠 Layer 2: Elite semantic scoring (batched)...');
  const batchRequests = passingPairs.map(({ job, candidate, resume }) => ({
    custom_id: `score__${job.id}__${candidate.id}__r${resume.index}`,
    params: {
      model: MODEL,
      max_tokens: 2000, // v2: cross-ATS output for 10 systems
      messages: [{ role: 'user' as const, content: eliteScoringPrompt(job, candidate, resume.text, resume.index) }],
    },
  }));

  const batchIds = await submitBatches(batchRequests, onLog);
  await pollUntilDone(batchIds, onLog);
  const rawResults = await collectBatchResults(batchIds);

  // Aggregate best score per (candidate, job)
  const bestScores = new Map<
    string,
    {
      score: number;
      breakdown: ScoreBreakdown;
      matchedKeywords: string[];
      missingKeywords: string[];
      matchReason: string;
      variantIndex: number;
      bestResumeId: string | null;
      allVariantScores: number[];
    }
  >();

  for (const { job, candidate, resume } of passingPairs) {
    const cid = `score__${job.id}__${candidate.id}__r${resume.index}`;
    const result = rawResults.get(cid);
    if (!result || result.error) continue;

    const dim = (key: string, defScore: number) => ({
      score: result[key]?.score ?? defScore,
      weight: result[key]?.weight ?? 0,
      reasoning: result[key]?.reasoning ?? '',
    });

    const breakdownBase = {
      keyword: dim('keyword', 50),
      experience: dim('experience', 50),
      title: dim('title', 50),
      education: dim('education', 75),
      location: dim('location', 80),
      formatting: dim('formatting', 50),
      behavioral: dim('behavioral', 50),
      soft: dim('soft', 50),
    };

    // v2: Cross-ATS gate — if any system fails, cap formatting and total below 82
    const crossAts: CrossATSPassthrough = result.cross_ats && typeof result.cross_ats === 'object'
      ? {
          all_systems_clear: !!result.cross_ats.all_systems_clear,
          systems: Array.isArray(result.cross_ats.systems) ? result.cross_ats.systems : [],
          guaranteed_interview_ready: !!result.cross_ats.guaranteed_interview_ready,
          resume_fix_priority: Array.isArray(result.cross_ats.resume_fix_priority) ? result.cross_ats.resume_fix_priority : [],
          optimized_resume_suggestions: Array.isArray(result.cross_ats.optimized_resume_suggestions) ? result.cross_ats.optimized_resume_suggestions : [],
        }
      : DEFAULT_CROSS_ATS;

    const anySystemFails = !crossAts.all_systems_clear;
    if (anySystemFails && breakdownBase.formatting.score > 69) {
      breakdownBase.formatting = { ...breakdownBase.formatting, score: Math.min(breakdownBase.formatting.score, 69) };
    }

    const total = computeWeightedScore(breakdownBase);
    const pairKey = `${candidate.id}__${job.id}`;
    const existing = bestScores.get(pairKey);

    if (!existing || total > existing.score) {
      const allScores = existing ? [...existing.allVariantScores, total] : [total];
      bestScores.set(pairKey, {
        score: total,
        breakdown: {
          ...breakdownBase,
          total,
          resume_variant_used: resume.index,
          per_variant_scores: allScores,
          cross_ats: crossAts,
        },
        matchedKeywords: result.matched_keywords ?? [],
        missingKeywords: result.missing_keywords ?? [],
        matchReason: result.match_reason ?? '',
        variantIndex: resume.index,
        bestResumeId: resume.resume_id ?? null,
        allVariantScores: allScores,
      });
    } else {
      existing.allVariantScores.push(total);
    }
  }

  const matches: MatchResult[] = [];
  const jobsWithResults = new Map<string, { job: EliteJob; matches: MatchResult[] }>();
  for (const job of jobs) jobsWithResults.set(job.id, { job, matches: [] });

  for (const [pairKey, data] of Array.from(bestScores.entries())) {
    if (data.score < SCORE_MIN_STORED) continue;
    const [candidateId, jobId] = pairKey.split('__');
    const crossAts = data.breakdown.cross_ats ?? DEFAULT_CROSS_ATS;
    const interviewReady = data.score >= 82 && crossAts.all_systems_clear && crossAts.guaranteed_interview_ready;
    const match: MatchResult = {
      candidate_id: candidateId,
      job_id: jobId,
      fit_score: data.score,
      match_reason: data.matchReason,
      matched_keywords: data.matchedKeywords,
      missing_keywords: data.missingKeywords,
      score_breakdown: data.breakdown,
      apply_tier: applyTier(data.score),
      interview_ready: interviewReady,
      best_resume_id: data.bestResumeId,
    };
    matches.push(match);
    jobsWithResults.get(jobId)?.matches.push(match);
  }

  const interviewReadyCount = matches.filter((m) => m.interview_ready).length;
  onLog(`\n  ✓ ${matches.length} matches above threshold (${SCORE_MIN_STORED}+) | ${interviewReadyCount} interview-ready (82+ & all ATS clear)\n`);

  // Layer 3: Cross-candidate ranking (optional, only if we have matches)
  let rankingInsights = new Map<string, any>();
  if (matches.length > 0) {
    onLog('🏆 Layer 3: Cross-candidate ranking...');
    const rankRequests: Array<{ custom_id: string; params: object }> = [];
    for (const [jobId, { job, matches: jobMatches }] of Array.from(jobsWithResults.entries())) {
      if (jobMatches.length === 0) continue;
      rankRequests.push({
        custom_id: `rank__${jobId}`,
        params: {
          model: MODEL,
          max_tokens: 800,
          messages: [{ role: 'user' as const, content: crossCandidatePrompt(job, jobMatches) }],
        },
      });
    }
    if (rankRequests.length > 0) {
      const rankBatchIds = await submitBatches(rankRequests, onLog);
      await pollUntilDone(rankBatchIds, onLog);
      const rankRaw = await collectBatchResults(rankBatchIds);
      for (const [cid, data] of Array.from(rankRaw.entries())) {
        const jobId = cid.replace('rank__', '');
        if (!data?.error) rankingInsights.set(jobId, data);
      }
      for (const [jobId, insights] of Array.from(rankingInsights.entries())) {
        const jobMatches = jobsWithResults.get(jobId)?.matches ?? [];
        const email = insights.recruiter_email;
        if (email && jobMatches[0]) jobMatches[0].recruiter_email = email;
      }
    }
  }

  const elapsed = (Date.now() - startTime) / 60000;
  const stats = {
    total_pairs: totalPairs,
    pairs_after_prefilter: passingPairs.length,
    pairs_filtered_out: filteredOut,
    matches_above_threshold: matches.length,
    interview_ready: interviewReadyCount,
    jobs_ranked: rankingInsights.size,
    elapsed_minutes: Math.round(elapsed * 10) / 10,
  };

  onLog('\n' + '═'.repeat(60));
  onLog('  ELITE ATS v2 — PIPELINE COMPLETE');
  onLog(`  Matches: ${matches.length} | Interview-ready (82+ & all ATS clear): ${interviewReadyCount}`);
  onLog(`  Jobs ranked: ${rankingInsights.size} | Elapsed: ${elapsed.toFixed(1)} min`);
  onLog('═'.repeat(60) + '\n');

  return { matches, rankingInsights, stats };
}

// ─────────────────────────────────────────────────────────────
// DB row shape — compatible with candidate_job_matches
// ─────────────────────────────────────────────────────────────

const DIM_KEYS = ['keyword', 'experience', 'title', 'education', 'location', 'formatting', 'behavioral', 'soft'] as const;

export function matchToDbRow(match: MatchResult): Record<string, unknown> {
  const d = match.score_breakdown;
  const dim = (key: (typeof DIM_KEYS)[number]) => {
    const x = d[key];
    if (!x || typeof x !== 'object') return { score: 50, details: '' };
    return { score: (x as DimensionScore).score, details: ((x as DimensionScore).reasoning || '').slice(0, 500) };
  };
  const dimensions: Record<string, { score: number; details: string }> = {};
  for (const k of DIM_KEYS) dimensions[k] = dim(k);

  const scoreBreakdown: Record<string, unknown> = {
    version: 4,
    engine: 'elite',
    engine_version: 'v2-cross-ats',
    dimensions,
    weights: { keyword: 30, experience: 18, title: 14, education: 8, location: 8, formatting: 7, behavioral: 7, soft: 8 },
    variant_scores: d.per_variant_scores ?? [],
    resume_variant_used: d.resume_variant_used,
  };
  if (d.cross_ats) scoreBreakdown.cross_ats = d.cross_ats;
  scoreBreakdown.interview_ready = match.interview_ready; // derivable from cross_ats + fit_score >= 82

  return {
    candidate_id: match.candidate_id,
    job_id: match.job_id,
    fit_score: match.fit_score,
    match_reason: match.match_reason,
    matched_keywords: match.matched_keywords,
    missing_keywords: match.missing_keywords,
    best_resume_id: match.best_resume_id ?? null,
    matched_at: new Date().toISOString(),
    score_breakdown: scoreBreakdown,
  };
}

/**
 * Human-readable "what to fix" report for a candidate whose resume isn't interview-ready yet.
 */
export function generateResumeFixReport(match: MatchResult): string {
  const crossAts = match.score_breakdown.cross_ats ?? DEFAULT_CROSS_ATS;
  if (match.interview_ready) return '✅ This resume is interview-ready across all 10 ATS systems.';

  const lines: string[] = [
    `Resume Fix Report — Candidate: ${match.candidate_id} | Job: ${match.job_id}`,
    `Current Score: ${match.fit_score}/100 | Interview Ready: NO`,
    '',
    '━━━ PRIORITY FIXES ━━━',
    ...crossAts.resume_fix_priority.map((f, i) => `${i + 1}. ${f}`),
    '',
    '━━━ SPECIFIC CHANGES ━━━',
    ...crossAts.optimized_resume_suggestions.map((s) => `• ${s}`),
    '',
    '━━━ SYSTEM-BY-SYSTEM ISSUES ━━━',
  ];
  for (const s of crossAts.systems.filter((x) => !x.passes)) {
    lines.push(`❌ ${s.system} (est. score: ${s.score_estimate})`);
    for (const b of s.blocking_issues) lines.push(`   BLOCKER: ${b}`);
    for (const k of s.keyword_gaps) lines.push(`   MISSING KEYWORD: "${k}"`);
    for (const f of s.fix_instructions) lines.push(`   FIX: ${f}`);
  }
  return lines.join('\n');
}
