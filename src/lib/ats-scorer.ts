// ============================================================================
// src/lib/ats-scorer.ts
// Deterministic ATS Scoring Engine - NO LLM, PURE MATH
// ============================================================================

import type { Candidate, Job } from '@/types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StructuredJob {
  normalizedTitle: string;
  relatedTitles: string[];
  seniorityLevel: 'junior' | 'mid' | 'senior' | 'lead' | 'principal' | 'c_level';
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  responsibilities: string[];
  minYearsExperience: number | null;
  isRemote: boolean;
  location: string | null; // FIX: Added missing location property
  visaRequirement: string | null;
  weightedKeywords: Record<string, number>;
  embedding: number[] | null;
}

export interface StructuredResume {
  extractedSkills: string[];
  extractedTools: string[];
  bullets: ResumeExperience[];
  totalExperienceYears: number;
  atsFormattingScore: number;
  embedding: number[] | null;
}

export interface ResumeExperience {
  company: string;
  title: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface ScoreComponents {
  titleAlignment: number;
  mustHaveCoverage: number;
  niceToHaveCoverage: number;
  semanticSimilarity: number;
  seniorityFit: number;
  formattingQuality: number;
  hardPenalties: number;
}

export interface ScoreResult {
  finalScore: number;
  components: ScoreComponents;
  matchedSkills: string[];
  missingSkills: string[];
  decision: 'ready' | 'optimize' | 'rewrite' | 'reject';
  explanation: string;
}

// FIX: Define a standalone interface for the Scorer's expected data shape.
// We avoid 'extends Candidate' to prevent conflicts with required properties (like primary_title)
// that we want to treat as optional or that might be missing in the partial logic.
interface ScorerCandidate {
  skills?: string[];
  tools?: string[];
  primary_title?: string;
  years_of_experience?: number;
  location?: string;
  visa_status?: string;
}

// ── Main Scorer ──────────────────────────────────────────────────────────────

export function calculateATSScore(
  job: StructuredJob,
  resume: StructuredResume,
  candidate: Candidate
): ScoreResult {

  // Cast to our local interface to access optional fields safely
  const c = candidate as unknown as ScorerCandidate;

  // Combine candidate profile skills with resume-extracted skills
  const candidateSkills = new Set([
    ...resume.extractedSkills.map(s => s.toLowerCase()),
    ...(c.skills || []).map((s: string) => s.toLowerCase()),
    ...(c.tools || []).map((s: string) => s.toLowerCase()),
  ]);

  // 1. Title Alignment (20% weight)
  const titleScore = calculateTitleAlignment(
    c.primary_title || '',
    job.normalizedTitle,
    job.relatedTitles
  );

  // 2. Must-Have Skills Coverage (40% weight - MOST CRITICAL)
  const mustHaveSkills = job.mustHaveSkills.map(s => s.toLowerCase());
  const matchedMustHave: string[] = [];
  const missingMustHave: string[] = [];

  for (const required of mustHaveSkills) {
    if (hasSkillMatch(required, candidateSkills)) {
      matchedMustHave.push(required);
    } else {
      missingMustHave.push(required);
    }
  }

  const mustHaveScore = mustHaveSkills.length > 0
    ? (matchedMustHave.length / mustHaveSkills.length) * 100
    : 100;

  // 3. Nice-to-Have Skills Coverage (15% weight)
  const niceToHaveSkills = job.niceToHaveSkills.map(s => s.toLowerCase());
  const matchedNiceToHave = niceToHaveSkills.filter(s => 
    hasSkillMatch(s, candidateSkills)
  );

  const niceToHaveScore = niceToHaveSkills.length > 0
    ? (matchedNiceToHave.length / niceToHaveSkills.length) * 100
    : 100;
  
  // 4. Semantic Similarity (10% weight)
  const semanticScore = calculateSemanticSimilarity(
    job.embedding,
    resume.embedding
  );

  // 5. Seniority Fit (10% weight)
  const seniorityScore = calculateSeniorityFit(
    job.seniorityLevel,
    job.minYearsExperience,
    resume.totalExperienceYears || c.years_of_experience || 0
  );

  // 6. Formatting Quality (5% weight)
  const formattingScore = resume.atsFormattingScore || 80;

  // 7. Hard Penalties
  let penalties = 0;

  // Domain mismatch penalty — prevent cross-domain matches
  const domainPenalty = calculateDomainPenalty(c.primary_title || '', job.normalizedTitle);
  penalties += domainPenalty;

  // Critical skill penalties (-15 per missing must-have)
  penalties += missingMustHave.length * 15;

  // Visa mismatch penalty
  if (job.visaRequirement && c.visa_status) {
    if (!isVisaMatch(job.visaRequirement, c.visa_status)) {
      penalties += 30;
    }
  }

  // Location mismatch penalty (only if not remote)
  if (!job.isRemote && job.location && c.location) {
    if (!isLocationMatch(job.location, c.location)) {
      penalties += 20;
    }
  }

  // Over/under-qualification penalty
  const candidateYears = resume.totalExperienceYears || c.years_of_experience || 0;
  const requiredYears = job.minYearsExperience || 0;
  const yearGap = Math.abs(candidateYears - requiredYears);
  if (yearGap > 5) {
    penalties += Math.min(25, yearGap * 2);
  }

  // 8. Calculate Weighted Score
  const components: ScoreComponents = {
    titleAlignment: titleScore * 0.20,
    mustHaveCoverage: mustHaveScore * 0.40,
    niceToHaveCoverage: niceToHaveScore * 0.15,
    semanticSimilarity: semanticScore * 0.10,
    seniorityFit: seniorityScore * 0.10,
    formattingQuality: formattingScore * 0.05,
    hardPenalties: -penalties,
  };

  const rawScore = Object.values(components).reduce((sum, val) => sum + val, 0);
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // 9. Decision Logic
  let decision: 'ready' | 'optimize' | 'rewrite' | 'reject';
  if (finalScore >= 85) decision = 'ready';
  else if (finalScore >= 70) decision = 'optimize';
  else if (finalScore >= 40) decision = 'rewrite';
  else decision = 'reject';

  // 10. Generate Explanation
  const explanation = generateExplanation(
    finalScore,
    decision,
    matchedMustHave,
    missingMustHave,
    penalties
  );

  return {
    finalScore,
    components,
    matchedSkills: [...matchedMustHave, ...matchedNiceToHave],
    missingSkills: missingMustHave,
    decision,
    explanation,
  };
}

// ── Helper Functions ─────────────────────────────────────────────────────────

function classifyDomainForScorer(title: string): string {
  const t = (title || '').toLowerCase().trim();
  if (!t) return 'general';
  if (/data\s*(engineer|architect|platform|infrastructure|pipeline|warehouse)|etl|big\s*data/i.test(t)) return 'data-engineering';
  if (/data\s*(scien|analy)|machine\s*learn|\bml\b|\bai\b.*eng|deep\s*learn|\bnlp\b|computer\s*vision/i.test(t)) return 'data-science';
  if (/devops|\bsre\b|site\s*reliab|cloud\s*(eng|arch)|platform\s*eng/i.test(t)) return 'devops';
  if (/full[\s-]*stack/i.test(t)) return 'fullstack';
  if (/\bios\b.*dev|android.*dev|mobile\s*(dev|eng)|react\s*native|flutter/i.test(t)) return 'mobile';
  if (/front[\s-]*end|ui\s*(dev|eng)|react\s*(dev|eng)|angular|vue/i.test(t)) return 'frontend';
  if (/\bqa\b|quality\s*assur|test\s*(auto|eng)|\bsdet\b/i.test(t)) return 'qa';
  if (/secur|cyber|infosec/i.test(t)) return 'security';
  if (/product\s*manag|program\s*manag|project\s*manag|\bscrum\b/i.test(t)) return 'management';
  if (/\bux\b|ui\s*design|product\s*design/i.test(t)) return 'design';
  if (/software|developer|engineer|programmer|back[\s-]*end|java(?!script)|python|\.net|c#|ruby|php|\bnode\b|spring|golang/i.test(t)) return 'software-engineering';
  return 'general';
}

const SCORER_DOMAIN_COMPAT: Record<string, string[]> = {
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

function calculateDomainPenalty(candidateTitle: string, jobTitle: string): number {
  const candDomain = classifyDomainForScorer(candidateTitle);
  const jobDomain = classifyDomainForScorer(jobTitle);
  if (candDomain === 'general' || jobDomain === 'general') return 0;
  const compatible = SCORER_DOMAIN_COMPAT[candDomain] || SCORER_DOMAIN_COMPAT['general'];
  if (compatible.includes(jobDomain)) return 0;
  return 50;
}

function calculateTitleAlignment(
  candidateTitle: string,
  jobTitle: string,
  relatedTitles: string[]
): number {
  const normalize = (t: string) => t.toLowerCase().trim();
  const candidate = normalize(candidateTitle);
  const target = normalize(jobTitle);

  // Exact match = 100
  if (candidate === target) return 100;

  // Related title match = 70
  if (relatedTitles.some(t => normalize(t) === candidate)) return 70;

  // Partial match (shared keywords) = 40
  const candidateWords = new Set(candidate.split(/\s+/).filter(w => w.length > 2));
  const targetWords = new Set(target.split(/\s+/).filter(w => w.length > 2));

  // FIX: Use Array.from instead of spread operator for Set iteration compatibility
  const intersection = Array.from(candidateWords).filter(w => targetWords.has(w));

  if (intersection.length >= 2) return 40;
  if (intersection.length === 1) return 20;
  
  return 0;
}

function hasSkillMatch(required: string, candidateSkills: Set<string>): boolean {
  const req = required.toLowerCase().trim();

  // Direct match
  if (candidateSkills.has(req)) return true;

  // Synonym/alias matching
  const SKILL_SYNONYMS: Record<string, string[]> = {
    'javascript': ['js', 'ecmascript', 'node', 'nodejs', 'node.js'],
    'typescript': ['ts'],
    'python': ['py', 'python3'],
    'react': ['reactjs', 'react.js'],
    'aws': ['amazon web services', 'amazon aws'],
    'docker': ['containers'],
    'kubernetes': ['k8s', 'k8', 'kube'],
    'postgresql': ['postgres', 'psql'],
    'mongodb': ['mongo'],
    'machine learning': ['ml', 'ai', 'artificial intelligence'],
    'sql': ['mysql', 'postgresql', 'mssql', 'oracle sql'],
  };

  // Check if required skill's synonyms match
  const synonyms = SKILL_SYNONYMS[req] || [];
  if (synonyms.some(syn => candidateSkills.has(syn))) return true;

  // Check reverse (candidate skill is synonym of required)
  for (const [canonical, syns] of Object.entries(SKILL_SYNONYMS)) {
    if (syns.includes(req) && candidateSkills.has(canonical)) return true;
  }

  return false;
}

function calculateSemanticSimilarity(
  jobEmbedding: number[] | null,
  resumeEmbedding: number[] | null
): number {
  // If embeddings not available, return neutral score
  if (!jobEmbedding || !resumeEmbedding) return 50;
  if (jobEmbedding.length !== resumeEmbedding.length) return 50;

  // Cosine similarity
  let dotProduct = 0;
  let magJob = 0;
  let magResume = 0;

  for (let i = 0; i < jobEmbedding.length; i++) {
    dotProduct += jobEmbedding[i] * resumeEmbedding[i];
    magJob += jobEmbedding[i] ** 2;
    magResume += resumeEmbedding[i] ** 2;
  }

  if (magJob === 0 || magResume === 0) return 50;

  const similarity = dotProduct / (Math.sqrt(magJob) * Math.sqrt(magResume));

  // Map [-1, 1] to [0, 100]
  return (similarity + 1) * 50;
}

function calculateSeniorityFit(
  requiredLevel: string | null,
  requiredYears: number | null,
  candidateYears: number
): number {
  // If no requirements, return neutral
  if (!requiredYears) return 50;

  const gap = Math.abs(candidateYears - requiredYears);

  if (gap === 0) return 100;
  if (gap <= 1) return 90;
  if (gap <= 2) return 75;
  if (gap <= 3) return 60;
  if (gap <= 5) return 40;
  return 20;
}

function isVisaMatch(required: string, candidate: string): boolean {
  const req = required.toLowerCase();
  const cand = candidate.toLowerCase();

  // US Citizen or Green Card typically satisfies most requirements
  if (cand.includes('us citizen') || cand.includes('green card')) return true;

  // Exact match
  if (req === cand) return true;

  // Partial match
  if (req.includes(cand) || cand.includes(req)) return true;

  return false;
}

function isLocationMatch(jobLoc: string, candidateLoc: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim();
  const job = normalize(jobLoc);
  const cand = normalize(candidateLoc);

  // Exact match
  if (job === cand) return true;

  // City match
  if (job.includes(cand) || cand.includes(job)) return true;

  // State match (extract state after comma)
  const extractState = (s: string) => s.split(',').pop()?.trim() || '';
  const jobState = extractState(job);
  const candState = extractState(cand);

  if (jobState && candState && jobState === candState) return true;

  return false;
}

function generateExplanation(
  score: number,
  decision: string,
  matched: string[],
  missing: string[],
  penalties: number
): string {
  const parts: string[] = [];

  // Overall assessment
  if (score >= 85) {
    parts.push(`Strong match (${score}/100) - ready to apply.`);
  } else if (score >= 70) {
    parts.push(`Good match (${score}/100) - optimize resume bullets for better keywords.`);
  } else if (score >= 40) {
    parts.push(`Weak match (${score}/100) - significant resume rewrite needed.`);
  } else {
    parts.push(`Poor match (${score}/100) - not recommended.`);
  }

  // Matched skills
  if (matched.length > 0) {
    const top = matched.slice(0, 5).join(', ');
    parts.push(`Matched key skills: ${top}.`);
  }

  // Missing critical skills
  if (missing.length > 0) {
    parts.push(`Missing required: ${missing.join(', ')}.`);
  }

  // Penalties
  if (penalties >= 30) {
    parts.push(`Penalties applied for visa/location/experience mismatch.`);
  }

  return parts.join(' ');
}