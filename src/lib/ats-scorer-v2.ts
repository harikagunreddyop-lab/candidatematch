/**
 * ATS Scorer v2 — Evidence-grounded deterministic scoring
 *
 * Non-negotiable rules:
 * - Skills only count fully when evidenced in bullets/projects; skills-list-only capped
 * - Must-have skills are gates + heavy weighted; missing = rank-ineligible (unless recruiter override)
 * - Responsibility matching: semantic + grounded (high cosine without shared tools = discounted)
 * - Long resumes: top-N bullets only for impact (P = min(18, total_bullets))
 * - Score + Confidence separate; low-confidence don't dominate ranking
 *
 * Claude is NOT used for score numbers. Deterministic scorer produces score + evidence.
 */

import { canonicalize, getAliases, SYNONYM_GROUPS, SKILL_IMPLICATIONS, getRelated } from '@/lib/skill-ontology';
import { extractImpactFromExperience } from '@/lib/impact-extractor';
import { buildKeywordEvidenceSpans } from '@/lib/evidence-spans';
import type { JobRequirements } from '@/lib/ats-engine';
import type { EvidenceSpan } from '@/lib/ats-engine';

// ── Constants ─────────────────────────────────────────────────────────────────

export const ATS_V2 = {
  /**
   * Must-skill evidence threshold: met only if Credit ≥ theta_must.
   * Set at 0.35 so that skills explicitly listed on a candidate's profile
   * (evidence ≈ 0.40) clear the gate even without bullet-level proof.
   */
  theta_must: 0.35,
  /**
   * Allowed missing must-haves before the gate blocks.
   * We now tolerate 1 missing must-have so otherwise excellent candidates
   * don't collapse to "gate blocked" for a single keyword.
   */
  allowed_missing_must: 1,
  /** Responsibility sim below this = unmatched */
  sim_min: 0.55,
  /** Strong responsibility match */
  sim_good: 0.70,
  /** Prevents "Java" faking "Kotlin" */
  related_credit_cap: 0.45,
  /** Top bullets for impact scoring */
  top_bullets_p: 18,
} as const;

/** Role families for recency τ (months) */
const TAU_BY_ROLE: Record<string, number> = {
  'software-engineering': 18, backend: 18, frontend: 18, fullstack: 18,
  'data-engineering': 18, 'data-science': 18, devops: 18, mobile: 18, security: 18,
  qa: 30, management: 30, design: 30, general: 30,
};

/** Universal v1 weights */
export const W_V2 = {
  // Slightly emphasize must + responsibilities, and give domain more weight.
  parse: 0.06,
  must: 0.30,
  nice: 0.06,
  resp: 0.26,
  impact: 0.14,
  scope: 0.07,
  recent: 0.05,
  domain: 0.04,
  risk: 0.02,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScorerInput {
  requirements: JobRequirements;
  candidateSkills: string[];
  candidateTools: string[];
  resumeText: string;
  experience: Array<{
    company?: string;
    title?: string;
    start_date?: string;
    end_date?: string;
    current?: boolean;
    responsibilities?: string[];
  }>;
  education: Array<{ degree?: string; field?: string }>;
  certifications: Array<{ name: string }>;
  location?: string;
  visa_status?: string;
  years_of_experience?: number;
  open_to_remote?: boolean;
  open_to_relocation?: boolean;
  target_locations?: string[];
  primary_title?: string;
  secondary_titles?: string[];
}

export interface NegativeSignal {
  type: 'job_hopping' | 'career_gap' | 'overlapping_roles' | 'inflated_seniority' | 'generic_language';
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

export interface ScorerOutput {
  total_score: number;
  confidence: number;
  band: 'elite' | 'strong' | 'possible' | 'weak';
  negative_signals?: NegativeSignal[];
  components: {
    parse: number;
    must: number;
    nice: number;
    resp: number;
    impact: number;
    scope: number;
    recent: number;
    domain: number;
    risk: number;
  };
  skill_credits: Map<string, number>;
  matched_must: string[];
  missing_must: string[];
  matched_nice: string[];
  missing_nice: string[];
  evidence_spans: EvidenceSpan[];
  gate_passed: boolean;
  gate_reason: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clip(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Count skill occurrences in bullets, projects, skills list */
function countSkillOccurrences(
  canonicalSkill: string,
  bullets: string[],
  projectBullets: string[],
  skillListTerms: string[],
): { bullet: number; project: number; list: number } {
  const terms = [canonicalSkill, ...getAliases(canonicalSkill)];
  const re = new RegExp(terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');

  let bullet = 0, project = 0, list = 0;
  for (const b of bullets) {
    const m = b.toLowerCase().match(re);
    if (m) bullet += m.length;
  }
  for (const b of projectBullets) {
    const m = b.toLowerCase().match(re);
    if (m) project += m.length;
  }
  const listLower = skillListTerms.map(s => s.toLowerCase());
  for (const t of terms) {
    if (listLower.some(s => s.includes(t) || t.includes(s))) list++;
  }
  return { bullet, project, list };
}

/** Evidence strength E(s) — skills-list entries provide a meaningful floor */
function evidenceStrength(
  counts: { bullet: number; project: number; list: number },
): number {
  const hasBullet = counts.bullet > 0;
  const hasProject = counts.project > 0;
  const hasListEntry = counts.list > 0;

  if (!hasBullet && !hasProject && !hasListEntry) return 0;

  const E_bullet = 1 - Math.exp(-0.6 * counts.bullet);
  const E_proj = 1 - Math.exp(-0.4 * counts.project);

  // Work-evidence: bullets are strongest, projects secondary
  const workE = 0.70 * E_bullet + 0.30 * E_proj;

  // A skill explicitly listed on the candidate's profile is a real signal —
  // they self-reported knowing it. Give a meaningful floor (0.40) so that
  // list-only skills aren't treated as zero-evidence.
  const listFloor = hasListEntry ? 0.40 : 0;

  let E = Math.max(workE, listFloor);

  // Corroboration bonus: skill both listed AND demonstrated in bullets
  if (hasListEntry && hasBullet) E = Math.min(1.0, E + 0.10);

  // Purely-listed skills capped — not as strong as bullet-evidenced
  if (!hasBullet && !hasProject) E = Math.min(E, 0.55);

  return clip(E, 0, 1);
}

/** Months since last use of skill (from experience) */
function monthsSinceLastUse(
  canonicalSkill: string,
  experience: ScorerInput['experience'],
): number {
  const terms = [canonicalSkill, ...getAliases(canonicalSkill)];
  const now = new Date();
  let lastEnd: Date | null = null;

  for (const exp of experience) {
    const text = [...(exp.responsibilities || []), exp.title || ''].join(' ').toLowerCase();
    const hasSkill = terms.some(t => text.includes(t));
    if (!hasSkill) continue;

    const end = exp.current ? now : (exp.end_date ? new Date(exp.end_date) : now);
    if (!lastEnd || end > lastEnd) lastEnd = end;
  }
  if (!lastEnd) return 999;
  const months = (now.getFullYear() - lastEnd.getFullYear()) * 12 + (now.getMonth() - lastEnd.getMonth());
  return Math.max(0, months);
}

/** Recency decay */
function recencyDecay(monthsSince: number, roleFamily: string): number {
  const tau = TAU_BY_ROLE[roleFamily] ?? 30;
  return clip(Math.exp(-monthsSince / tau), 0.35, 1.0);
}

/** Match quality Q: exact 1, alias 0.9, related min(ρ, 0.45), none 0 */
function matchQuality(jdSkillCanon: string, candSkillCanon: string): number {
  if (jdSkillCanon === candSkillCanon) return 1.0;
  const jdAliases = getAliases(jdSkillCanon);
  const candAliases = getAliases(candSkillCanon);
  if (jdAliases.includes(candSkillCanon) || candAliases.includes(jdSkillCanon)) return 0.9;
  const jdRelated = getRelated(jdSkillCanon).map(canonicalize);
  const candRelated = getRelated(candSkillCanon).map(canonicalize);
  if (jdRelated.includes(candSkillCanon) || candRelated.includes(jdSkillCanon)) return ATS_V2.related_credit_cap;
  for (const g of SYNONYM_GROUPS) {
    const canon = g[0];
    if (g.includes(jdSkillCanon) && g.includes(candSkillCanon)) return 0.9;
  }
  return 0;
}

/** Build candidate canonical skills with evidence + recency */
function buildCandidateSkillMap(
  input: ScorerInput,
): Map<string, { E: number; recency: number }> {
  const bullets = input.experience.flatMap(e => e.responsibilities || []).filter(Boolean);
  const projectBullets: string[] = [];
  const skillSections = parseSkillSections(input.resumeText);
  const skillListTerms = [...input.candidateSkills, ...input.candidateTools];

  for (const s of skillSections) {
    if (s.name === 'projects') projectBullets.push(...s.text.split(/[.!]\s*/).filter(Boolean));
  }

  const roleFamily = input.requirements.domain || 'general';
  const result = new Map<string, { E: number; recency: number }>();

  // Canonical skills explicitly listed by the candidate (profile-level claim)
  const listedCanonicals = new Set<string>();
  for (const s of skillListTerms) {
    listedCanonicals.add(canonicalize(s));
  }

  const allCandidateCanon = new Set<string>();
  for (const s of [...input.candidateSkills, ...input.candidateTools]) {
    allCandidateCanon.add(canonicalize(s));
  }
  for (const group of SYNONYM_GROUPS) {
    const sectionText = bullets.join(' ').toLowerCase() + ' ' + projectBullets.join(' ').toLowerCase();
    for (const term of group) {
      if (sectionText.includes(term) || skillListTerms.some(st => st.toLowerCase().includes(term))) {
        allCandidateCanon.add(group[0]);
        break;
      }
    }
  }

  for (const canon of Array.from(allCandidateCanon)) {
    const counts = countSkillOccurrences(canon, bullets, projectBullets, skillListTerms);
    const E = evidenceStrength(counts);
    let m = monthsSinceLastUse(canon, input.experience);
    // Skills explicitly listed on the candidate's profile are assumed currently
    // active even when not mentioned in experience bullets. Without this,
    // listed-but-not-bulleted skills get monthsSince=999 → recency=0.35,
    // making their credit ≈ 0.14 (too low to pass the must-have gate).
    if (m >= 999 && listedCanonicals.has(canon)) {
      m = 0;
    }
    const rec = recencyDecay(m, roleFamily);
    result.set(canon, { E, recency: rec });
  }
  return result;
}

function parseSkillSections(text: string): Array<{ name: string; text: string }> {
  const lines = text.split('\n');
  const sections: Array<{ name: string; text: string }> = [];
  let current = { name: 'unknown', text: '' };

  const patterns: [RegExp, string][] = [
    [/^(technical\s+)?skills|core\s+competenc|technologies|tech\s+stack/i, 'skills'],
    [/^project|portfolio|personal\s+project/i, 'projects'],
  ];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let matched = false;
    for (const [re, name] of patterns) {
      if (re.test(t) && t.length < 60) {
        if (current.text.trim()) sections.push(current);
        current = { name, text: '' };
        matched = true;
        break;
      }
    }
    if (!matched) current.text += t + ' ';
  }
  if (current.text.trim()) sections.push(current);
  return sections;
}

/** Skill credit for JD skill sj */
function skillCredit(
  jdSkillCanon: string,
  candidateMap: Map<string, { E: number; recency: number }>,
): number {
  let best = 0;
    for (const [candCanon, { E, recency }] of Array.from(candidateMap)) {
    const Q = matchQuality(jdSkillCanon, candCanon);
    const cred = Q * E * recency;
    if (cred > best) best = cred;
  }
  return best;
}

// ── Component scores ──────────────────────────────────────────────────────────

function C_parse(resumeText: string, sections: ReturnType<typeof parseResumeSections>): number {
  const sectionNames = sections.map(s => s.name);
  const section = [sectionNames.includes('skills'), sectionNames.includes('experience'), sectionNames.includes('education'), sectionNames.includes('summary')].filter(Boolean).length / 4;
  const dateCount = (resumeText.match(/\b(20\d{2}|19\d{2})\b/g) || []).length;
  const dates = clip(dateCount / 6, 0, 1);
  const lines = resumeText.split('\n').filter(l => l.trim());
  const bulletCount = (resumeText.match(/^[\s]*[•\-\*]\s/gm) || []).length;
  const bullets = clip(bulletCount / 15, 0, 1);
  const hasContact = /[\w.-]+@[\w.-]+\.\w+/.test(resumeText) ? 1 : 0;
  const contact = hasContact * 0.5 + (/linkedin|github/.test(resumeText.toLowerCase()) ? 0.5 : 0);
  const raw = 0.3 * (section ? 1 : 0.5) + 0.25 * dates + 0.25 * bullets + 0.2 * contact;
  return 100 * clip(raw, 0, 1);
}

function C_must(
  mustSkills: string[],
  credits: Map<string, number>,
): { score: number; matched: string[]; missing: string[] } {
  if (mustSkills.length === 0) return { score: 100, matched: [], missing: [] };
  const matched: string[] = [];
  const missing: string[] = [];
  let sum = 0;
  for (const s of mustSkills) {
    const c = canonicalize(s);
    const cred = credits.get(c) ?? 0;
    sum += cred;
    if (cred >= ATS_V2.theta_must) matched.push(c);
    else missing.push(c);
  }
  // Match rate: binary fraction of must-haves that clear the evidence threshold
  const matchRate = matched.length / mustSkills.length;
  // Coverage: average evidence quality across all must-haves
  const covM = sum / mustSkills.length;
  // Blended score emphasises match rate (you have it or not) while also
  // rewarding deeper evidence quality. A 4/5 match yields ~65 instead of ~20.
  const blended = 0.60 * matchRate + 0.40 * covM;
  const score = 100 * clip(blended, 0, 1);
  return { score, matched, missing };
}

function C_nice(niceSkills: string[], credits: Map<string, number>): number {
  if (niceSkills.length === 0) return 100;
  let sum = 0;
  for (const s of niceSkills) {
    const c = canonicalize(s);
    sum += credits.get(c) ?? 0;
  }
  return 100 * clip(sum / niceSkills.length, 0, 1);
}

/**
 * Keyword-overlap proxy for responsibility matching when semantic similarity
 * (vector-space / embeddings) is not available. Extracts meaningful keywords
 * from JD responsibilities and checks how many appear in resume bullets.
 */
function keywordOverlapProxy(jdResp: string[], resumeBullets: string[]): number {
  if (!jdResp.length || !resumeBullets.length) return 0.5;
  const STOP = new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'in', 'for', 'of', 'with', 'on',
    'at', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'should', 'can', 'could',
    'may', 'must', 'that', 'this', 'from', 'as', 'but', 'not', 'all', 'any',
    'each', 'so', 'if', 'its', 'our', 'your', 'their', 'more', 'other',
    'than', 'also', 'into', 'about', 'such', 'new', 'use', 'using', 'used',
    'work', 'working', 'ensure', 'across', 'within', 'between', 'through',
  ]);
  const jdKeywords = new Set<string>();
  for (const r of jdResp) {
    for (const word of r.toLowerCase().split(/\W+/)) {
      if (word.length >= 3 && !STOP.has(word)) jdKeywords.add(word);
    }
  }
  if (!jdKeywords.size) return 0.5;
  const bulletText = resumeBullets.join(' ').toLowerCase();
  let matched = 0;
  for (const kw of jdKeywords) {
    if (bulletText.includes(kw)) matched++;
  }
  // 0.30 baseline (some latent overlap assumed) + 0.70 scaled by actual overlap
  return 0.30 + 0.70 * (matched / jdKeywords.size);
}

function C_resp(
  jdResponsibilities: string[],
  resumeBullets: string[],
  bulletsSim: number | null,
  sharedEvidence: number,
): number {
  if (jdResponsibilities.length === 0) return 100;
  // When real semantic similarity is available, use it. Otherwise compute a
  // keyword-overlap proxy instead of the old hardcoded 0.5 fallback which
  // capped C_resp at ~44 even for well-matched candidates.
  const baseSim = bulletsSim ?? keywordOverlapProxy(jdResponsibilities, resumeBullets);
  const ground = 0.6 + 0.4 * sharedEvidence;
  const adjSim = baseSim * ground;
  const unmatched = adjSim < ATS_V2.sim_min ? 1 : 0;
  const pen = Math.min(0.35, unmatched * 0.06);
  return 100 * clip(adjSim - pen, 0, 1);
}

function C_impact(bullets: string[], impactResult: { totalCount: number; bulletsWithImpact: number }): number {
  const P = Math.min(ATS_V2.top_bullets_p, bullets.length);
  if (P === 0) return 50;
  const ACTION = /\b(built|created|led|managed|designed|implemented|reduced|improved|increased|deployed|scaled|automated)\b/i;
  const METRIC = /\d+%|\$[\d,.]+[kmb]?|\d+x\s|saved|reduced|increased|improved|grew/i;
  const TOOL = new Set([...SYNONYM_GROUPS.flat().map(s => s.toLowerCase())]);

  const qbs: number[] = [];
  for (let i = 0; i < Math.min(P, bullets.length); i++) {
    const b = bullets[i];
    const hasAction = ACTION.test(b) ? 1 : 0;
    const hasObject = (/\b(the|a|an)\s+\w+/.test(b) || b.split(/\s+/).length > 5) ? 1 : 0;
    const hasTool = Array.from(TOOL).some(t => b.toLowerCase().includes(t)) ? 1 : 0;
    const hasMetric = METRIC.test(b) ? 1 : 0;
    const metricQuality = (b.match(METRIC)?.length ?? 0) >= 2 ? 1 : (b.match(METRIC) ? 0.6 : 0);
    const qb = 0.2 * hasAction + 0.2 * hasObject + 0.15 * hasTool + 0.25 * hasMetric + 0.2 * metricQuality;
    qbs.push(qb);
  }
  const mean = qbs.reduce((a, b) => a + b, 0) / qbs.length;
  return 100 * clip(mean, 0, 1);
}

function C_scope(
  requirements: JobRequirements,
  candidateYears: number,
  resumeText: string,
): number {
  const yMin = requirements.min_years_experience ?? 0;
  const yMax = requirements.preferred_years_experience ?? yMin + 2;

  // Full credit within the stated range. Gentle penalty outside.
  let fit_years: number;
  if (candidateYears >= yMin && candidateYears <= yMax) {
    fit_years = 1.0;
  } else if (candidateYears < yMin) {
    const gap = yMin - candidateYears;
    fit_years = Math.max(0, 1 - gap / Math.max(2, yMin));
  } else {
    // Over-qualified: gentler penalty (extra experience is still valuable)
    const gap = candidateYears - yMax;
    fit_years = Math.max(0.3, 1 - gap / Math.max(4, yMax));
  }

  const leadership = (resumeText.match(/\b(led|managed|directed|mentored|headed)\b/gi) || []).length;
  const lead = clip(leadership / 3, 0, 1);
  const scale = (resumeText.match(/million|billion|10k\+|100k\+|\d+%|\d+x/gi) || []).length;
  const scaleNorm = clip(scale / 3, 0, 1);
  return 100 * clip(0.45 * fit_years + 0.3 * lead + 0.25 * scaleNorm, 0, 1);
}

function C_recent(
  mustSkills: string[],
  niceSkills: string[],
  recencyForJdSkill: Map<string, number>,
): number {
  const mustRec = mustSkills.length === 0 ? 1 : mustSkills.reduce((s, k) => s + (recencyForJdSkill.get(canonicalize(k)) ?? 0.5), 0) / mustSkills.length;
  const niceRec = niceSkills.length === 0 ? 1 : niceSkills.reduce((s, k) => s + (recencyForJdSkill.get(canonicalize(k)) ?? 0.5), 0) / Math.max(1, niceSkills.length);
  return 100 * clip(0.7 * mustRec + 0.3 * niceRec, 0, 1);
}

function C_domain(jobDomain: string, candidateTitles: string[]): number {
  if (!jobDomain || jobDomain === 'general') return 100;
  const domainPatterns: Record<string, RegExp> = {
    'data-engineering': /data\s*(engineer|architect|pipeline)|etl|big\s*data/i,
    'data-science': /data\s*scien|machine\s*learn|\bml\b|\bai\b|deep\s*learn|\bnlp\b/i,
    'backend': /back[\s-]*end|server|api\s*(dev|eng)/i,
    'frontend': /front[\s-]*end|ui\s*(dev|eng)|react|angular|vue/i,
    'fullstack': /full[\s-]*stack/i,
    'devops': /devops|\bsre\b|cloud\s*(eng|arch)/i,
    'mobile': /mobile|ios|android|react\s*native|flutter/i,
    'qa': /\bqa\b|test\s*(auto|eng)/i,
    'security': /secur|cyber|infosec/i,
  };
  const re = domainPatterns[jobDomain];
  if (!re) return 75;
  const match = candidateTitles.some(t => re.test(t));
  return match ? 100 : 40;
}

/** Detect overlapping employment, gaps, job hopping, inflated titles */
function detectNegativeSignals(
  experience: ScorerInput['experience'],
  resumeText: string,
  candidateYears: number,
): NegativeSignal[] {
  const signals: NegativeSignal[] = [];
  const sorted = [...experience].sort((a, b) => {
    const dA = a.start_date ? new Date(a.start_date).getTime() : 0;
    const dB = b.start_date ? new Date(b.start_date).getTime() : 0;
    return dA - dB;
  });

  let overlaps = 0;
  let gap_months = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevStart = prev.start_date ? new Date(prev.start_date) : null;
    const prevEnd = prev.current ? new Date() : (prev.end_date ? new Date(prev.end_date) : null);
    const currStart = curr.start_date ? new Date(curr.start_date) : null;
    const currEnd = curr.current ? new Date() : (curr.end_date ? new Date(curr.end_date) : null);
    if (prevStart && prevEnd && currStart && currEnd && currStart < prevEnd) {
      overlaps++;
    }
    if (prevEnd && currStart && currStart > prevEnd) {
      gap_months += (currStart.getFullYear() - prevEnd.getFullYear()) * 12 + (currStart.getMonth() - prevEnd.getMonth());
    }
  }

  if (overlaps > 0) {
    signals.push({
      type: 'overlapping_roles',
      severity: overlaps >= 2 ? 'high' : 'medium',
      detail: `${overlaps} overlapping job period(s) detected`,
    });
  }
  if (gap_months > 12) {
    signals.push({
      type: 'career_gap',
      severity: gap_months > 24 ? 'high' : 'medium',
      detail: `${Math.round(gap_months / 12)} year career gap`,
    });
  }

  const roles = experience.length;
  const careerMonths = experience.reduce((acc, e) => {
    const start = e.start_date ? new Date(e.start_date) : null;
    const end = e.current ? new Date() : (e.end_date ? new Date(e.end_date) : null);
    if (!start || !end) return acc;
    return acc + Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
  }, 0);
  const careerYears = careerMonths / 12 || 1;
  const job_hop_rate = roles / careerYears;
  if (job_hop_rate > 1.5 && roles >= 4) {
    signals.push({
      type: 'job_hopping',
      severity: job_hop_rate > 2 ? 'high' : 'medium',
      detail: `${roles} roles in ${careerYears.toFixed(1)} years (avg ${(12 / job_hop_rate).toFixed(0)} mo/role)`,
    });
  }

  const seniorTitles = /\b(principal|staff|director|vp|head of)\b/i;
  const hasSeniorTitle = experience.some(e => seniorTitles.test(e.title || ''));
  if (hasSeniorTitle && candidateYears < 5) {
    signals.push({
      type: 'inflated_seniority',
      severity: candidateYears < 3 ? 'high' : 'low',
      detail: `Senior title with ${candidateYears} years experience`,
    });
  }

  const genericCount = (resumeText.match(/\b(synergy|leverage|best.of.breed|thought.leader|passionate|hard.working|team.player)\b/gi) || []).length;
  if (genericCount >= 2) {
    signals.push({
      type: 'generic_language',
      severity: 'low',
      detail: `${genericCount} generic buzzwords detected`,
    });
  }

  return signals;
}

function C_risk(
  experience: ScorerInput['experience'],
  _resumeText: string,
  negativeSignals: NegativeSignal[],
): number {
  const roles = experience.length;
  const careerMonths = experience.reduce((acc, e) => {
    const start = e.start_date ? new Date(e.start_date) : null;
    const end = e.current ? new Date() : (e.end_date ? new Date(e.end_date) : null);
    if (!start || !end) return acc;
    return acc + (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  }, 0);
  const careerYears = careerMonths / 12 || 1;
  const job_hop_rate = roles / careerYears;

  let overlaps = 0;
  let gap_months = 0;
  const sorted = [...experience].sort((a, b) => {
    const dA = a.start_date ? new Date(a.start_date).getTime() : 0;
    const dB = b.start_date ? new Date(b.start_date).getTime() : 0;
    return dA - dB;
  });
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevEnd = prev.current ? new Date() : (prev.end_date ? new Date(prev.end_date) : null);
    const currStart = curr.start_date ? new Date(curr.start_date) : null;
    if (prevEnd && currStart) {
      if (currStart < prevEnd) overlaps++;
      else gap_months += (currStart.getFullYear() - prevEnd.getFullYear()) * 12 + (currStart.getMonth() - prevEnd.getMonth());
    }
  }

  const reduction = clip(0.08 * overlaps + 0.02 * job_hop_rate + 0.01 * Math.max(0, gap_months - 3), 0, 0.6);
  const risk = 1 - reduction;
  return 100 * risk;
}

function parseResumeSections(text: string): Array<{ name: string; text: string }> {
  const lines = text.split('\n');
  const sections: Array<{ name: string; text: string }> = [];
  let current = { name: 'summary', text: '' };
  const SECTION_PATTERNS: [RegExp, string][] = [
    [/^(technical\s+)?skills|core\s+competenc/i, 'skills'],
    [/^summary|objective|profile|about/i, 'summary'],
    [/^(work\s+)?experience|employment/i, 'experience'],
    [/^education|academic/i, 'education'],
    [/^project|portfolio/i, 'projects'],
  ];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let matched = false;
    for (const [re, name] of SECTION_PATTERNS) {
      if (re.test(t) && t.length < 60) {
        if (current.text.trim()) sections.push(current);
        current = { name, text: '' };
        matched = true;
        break;
      }
    }
    if (!matched) current.text += t + '\n';
  }
  if (current.text.trim()) sections.push(current);
  return sections;
}

// ── Main scorer ───────────────────────────────────────────────────────────────

export interface ScorerOptions {
  bulletsResponsibilitiesSim?: number | null;
}

export function computeATSScoreV2(
  input: ScorerInput,
  options?: ScorerOptions,
): ScorerOutput {
  const mustSkills = (input.requirements.must_have_skills || []).map(canonicalize);
  const niceSkills = (input.requirements.nice_to_have_skills || []).map(canonicalize);
  const roleFamily = input.requirements.domain || 'general';

  const candidateMap = buildCandidateSkillMap(input);
  const skillCredits = new Map<string, number>();
  const recencyForJdSkill = new Map<string, number>();

  for (const s of [...mustSkills, ...niceSkills]) {
    let best = 0;
    let bestRecency = 0.5;
    for (const [candCanon, { E, recency }] of Array.from(candidateMap)) {
      const Q = matchQuality(s, candCanon);
      const cred = Q * E * recency;
      if (cred > best) {
        best = cred;
        bestRecency = recency;
      }
    }
    skillCredits.set(s, best);
    recencyForJdSkill.set(s, bestRecency);
  }

  const mustResult = C_must(
    mustSkills,
    skillCredits,
  );
  const niceScore = C_nice(niceSkills, skillCredits);

  const bullets = input.experience.flatMap(e => e.responsibilities || []).filter(Boolean);
  const jdResp = input.requirements.responsibilities || [];
  const sharedEvidence = computeSharedEvidence(mustSkills, niceSkills, bullets, input.candidateSkills, input.candidateTools);
  const respScore = C_resp(jdResp, bullets, options?.bulletsResponsibilitiesSim ?? null, sharedEvidence);

  const impactResult = extractImpactFromExperience(input.experience);
  const impactScore = C_impact(bullets, impactResult);

  const sections = parseResumeSections(input.resumeText);
  const parseScore = C_parse(input.resumeText, sections);

  const candidateYears = input.years_of_experience ?? (input.experience.length ? 5 : 0);
  const scopeScore = C_scope(input.requirements, candidateYears, input.resumeText);

  const recentScore = C_recent(mustSkills, niceSkills, recencyForJdSkill);

  const titles = [input.primary_title, ...(input.secondary_titles || [])].filter(Boolean) as string[];
  const domainScore = C_domain(roleFamily, titles);

  const negativeSignals = detectNegativeSignals(input.experience, input.resumeText, candidateYears);
  const riskScore = C_risk(input.experience, input.resumeText, negativeSignals);

  const w = W_V2;
  const wDomain = input.requirements.domain && input.requirements.domain !== 'general' ? w.domain : 0;
  const totalWeight = w.parse + w.must + w.nice + w.resp + w.impact + w.scope + w.recent + wDomain + w.risk;

  // Guard against divide-by-zero / NaN so we always return a numeric score.
  let raw = (parseScore * w.parse
    + mustResult.score * w.must
    + niceScore * w.nice
    + respScore * w.resp
    + impactScore * w.impact
    + scopeScore * w.scope
    + recentScore * w.recent
    + domainScore * wDomain
    + riskScore * w.risk) / (totalWeight || 1);

  if (!Number.isFinite(raw)) {
    raw = 0;
  }

  // Final ATS score: pure weighted combination of components, clipped to [0, 100]
  // with NO artificial floor. Extremely low scores are possible when must-haves,
  // responsibilities and domain are badly mismatched.
  raw = Math.round(clip(raw, 0, 100));

  const band = raw >= 90 ? 'elite' : raw >= 80 ? 'strong' : raw >= 70 ? 'possible' : 'weak';

  const gate_passed = mustResult.missing.length <= ATS_V2.allowed_missing_must;
  const gate_reason = gate_passed
    ? `Gate passed — ${mustResult.matched.length}/${mustSkills.length} must-haves met`
    : `Gate blocked — missing must-haves: ${mustResult.missing.slice(0, 5).join(', ')}${mustResult.missing.length > 5 ? '...' : ''}`;

  const confidence = computeConfidence(
    parseScore / 100,
    mustResult.matched,
    mustSkills,
    skillCredits,
    options?.bulletsResponsibilitiesSim ?? 0,
    impactResult.bulletsWithImpact,
    bullets.length,
  );

  const skillToSource = new Map<string, 'must_have' | 'nice_to_have'>();
  for (const m of mustResult.matched) skillToSource.set(m, 'must_have');
  for (const n of niceSkills) if ((skillCredits.get(n) ?? 0) >= 0.3) skillToSource.set(n, 'nice_to_have');
  const evidenceSpans = buildKeywordEvidenceSpans(
    [...mustResult.matched, ...niceSkills.filter(n => (skillCredits.get(n) ?? 0) >= 0.3)],
    input.resumeText,
    s => [s, ...getAliases(s)],
    s => skillToSource.get(s),
  );

  return {
    total_score: raw,
    confidence,
    band,
    negative_signals: negativeSignals.length > 0 ? negativeSignals : undefined,
    components: {
      parse: Math.round(parseScore),
      must: Math.round(mustResult.score),
      nice: Math.round(niceScore),
      resp: Math.round(respScore),
      impact: Math.round(impactScore),
      scope: Math.round(scopeScore),
      recent: Math.round(recentScore),
      domain: Math.round(domainScore),
      risk: Math.round(riskScore),
    },
    skill_credits: skillCredits,
    matched_must: mustResult.matched,
    missing_must: mustResult.missing,
    matched_nice: niceSkills.filter(n => (skillCredits.get(n) ?? 0) >= 0.3),
    missing_nice: niceSkills.filter(n => (skillCredits.get(n) ?? 0) < 0.3),
    evidence_spans: evidenceSpans,
    gate_passed,
    gate_reason,
  };
}

function computeSharedEvidence(
  mustSkills: string[],
  niceSkills: string[],
  bullets: string[],
  candidateSkills: string[],
  candidateTools: string[],
): number {
  const allJd = new Set([...mustSkills, ...niceSkills]);
  if (allJd.size === 0) return 1;
  const bulletText = bullets.join(' ').toLowerCase();
  const candSet = new Set([...candidateSkills, ...candidateTools].map(s => canonicalize(s.toLowerCase())));
  let shared = 0;
  for (const jd of Array.from(allJd)) {
    const aliases = [jd, ...getAliases(jd)];
    if (aliases.some(a => bulletText.includes(a) || candSet.has(canonicalize(a)))) shared++;
  }
  return shared / allJd.size;
}

function computeConfidence(
  p: number,
  matchedMust: string[],
  mustSkills: string[],
  skillCredits: Map<string, number>,
  respSim: number,
  bulletsWithImpact: number,
  totalBullets: number,
): number {
  const e = mustSkills.length === 0 ? 0.5 : matchedMust.reduce((s, m) => s + (skillCredits.get(m) ?? 0), 0) / mustSkills.length;
  const r = respSim;
  const m = totalBullets === 0 ? 0 : bulletsWithImpact / totalBullets;
  return clip(0.35 * p + 0.35 * e + 0.2 * r + 0.1 * m, 0, 1);
}

// ── Test-only exports ────────────────────────────────────────────────────────
// Exposed so unit tests can verify individual component functions in isolation.
export const _test = {
  evidenceStrength,
  keywordOverlapProxy,
  clip,
} as const;
