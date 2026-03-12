/**
 * ATS Scorer — single authoritative scorer
 *
 * Weight vector (research-grounded):
 *
 * keyword_coverage   0.35  — Primary ranking signal in Taleo, iCIMS, SmartRecruiters
 * parse_integrity    0.20  — Parse failure = invisible resume on Taleo, iCIMS, Workday
 * experience_match   0.18  — SmartRecruiters Fit Score, Workday field filter, iCIMS title filter
 * section_complete   0.12  — All ATS require standard sections to populate candidate record
 * keyword_placement  0.10  — iCIMS/Greenhouse weight experience bullets over skills list
 * formatting_detail  0.05  — Date consistency (Taleo/iCIMS), contact format
 *
 * Score calibration (Jobscan 75% match = success + Taleo strictness baseline):
 *   80-100: Passes Taleo (strictest). Will pass all modern ATS.
 *   65-79:  Passes Greenhouse, Lever, Workday, iCIMS. May struggle with Taleo/SmartRecruiters.
 *   50-64:  Passes only the most lenient ATS (Greenhouse human review). Needs significant work.
 *   0-49:   Likely auto-rejected or invisible in all major systems.
 */

import type { JobRequirements, ResumeCandidate, ATSScoreResult, DimensionResult } from './types';
import { analyzeKeywords } from './keyword-analyzer';
import { analyzeParseIntegrity } from './parse-analyzer';

function clip(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function scoreDimension(score: number, weight: number, label: string, details: string, extras: Partial<DimensionResult> = {}): DimensionResult {
  return {
    score: Math.round(clip(score, 0, 100)),
    max: 100,
    weight,
    contribution: Math.round(score * weight * 10) / 10,
    label,
    details,
    ...extras,
  };
}

// ── Experience match score ────────────────────────────────────────────────────

function scoreExperienceMatch(req: JobRequirements, candidate: ResumeCandidate): { score: number; details: string } {
  const yrsCandidate = candidate.years_of_experience ?? deriveYearsFromExperience(candidate.experience);
  const yrsMin = req.min_years_experience ?? 0;
  const yrsPreferred = req.preferred_years_experience ?? yrsMin + 2;

  let yearsFit: number;
  if (yrsMin === 0) {
    yearsFit = 100;
  } else if (yrsCandidate >= yrsMin && yrsCandidate <= yrsPreferred) {
    yearsFit = 100;
  } else if (yrsCandidate < yrsMin) {
    const gap = yrsMin - yrsCandidate;
    yearsFit = Math.max(20, 100 - gap * 20);
  } else {
    // Over-qualified — gentle penalty
    const gap = yrsCandidate - yrsPreferred;
    yearsFit = Math.max(60, 100 - gap * 5);
  }

  // Domain/title alignment
  const titleMatch = scoreTitleDomain(req.domain, [
    candidate.primary_title ?? '',
    ...candidate.secondary_titles,
  ]);

  const score = 0.55 * yearsFit + 0.45 * titleMatch;
  const details = `${yrsCandidate} yrs experience (need ${yrsMin}+). Title domain match: ${Math.round(titleMatch)}%`;
  return { score, details };
}

function deriveYearsFromExperience(experience: ResumeCandidate['experience']): number {
  let totalMonths = 0;
  const now = new Date();
  for (const exp of experience) {
    const start = exp.start_date ? new Date(exp.start_date) : null;
    const end = exp.current ? now : (exp.end_date ? new Date(exp.end_date) : null);
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    totalMonths += Math.max(0, months);
  }
  return Math.round(totalMonths / 12);
}

const DOMAIN_PATTERNS: Record<string, RegExp> = {
  'frontend':         /front[\s-]*end|ui\s*(dev|eng)|react\s*(dev|eng)|angular|vue/i,
  'backend':          /back[\s-]*end|server\s*side|api\s*(dev|eng)/i,
  'fullstack':        /full[\s-]*stack/i,
  'data-engineering': /data\s*(engineer|architect|pipeline)|etl|big\s*data/i,
  'data-science':     /data\s*(scien|analy)|machine\s*learn|\bml\b|deep\s*learn|\bnlp\b/i,
  'devops':           /devops|\bsre\b|cloud\s*(eng|arch)|platform\s*eng/i,
  'mobile':           /mobile|ios|android|react\s*native|flutter/i,
  'qa':               /\bqa\b|quality\s*(assur|eng)|test\s*(auto|eng)|\bsdet\b/i,
  'security':         /secur|cyber|infosec/i,
  'management':       /engineering\s*manager|\bvp\b.*eng|director.*eng|program\s*manager/i,
  'design':           /\bux\b|ui\s*design|product\s*design/i,
};

function scoreTitleDomain(jobDomain: string, candidateTitles: string[]): number {
  if (!jobDomain || jobDomain === 'general') return 80;
  const re = DOMAIN_PATTERNS[jobDomain];
  if (!re) return 70;
  if (candidateTitles.some(t => re.test(t))) return 100;
  // Partial: check if software/engineering appears (broad match)
  if (candidateTitles.some(t => /engineer|developer|programmer|architect/i.test(t))) return 60;
  return 30;
}

// ── Section completeness score ────────────────────────────────────────────────

function scoreSectionCompleteness(parseResult: ReturnType<typeof analyzeParseIntegrity>): { score: number; details: string } {
  const required = ['experience', 'education', 'skills'];
  const bonus = ['summary', 'certifications'];

  const foundRequired = required.filter(s => parseResult.parseable_sections.includes(s));
  const foundBonus = bonus.filter(s => parseResult.parseable_sections.includes(s));

  const requiredScore = (foundRequired.length / required.length) * 80;
  const bonusScore = (foundBonus.length / bonus.length) * 20;
  const score = requiredScore + bonusScore;

  const missing = required.filter(s => !parseResult.parseable_sections.includes(s));
  const details = missing.length === 0
    ? `All required sections present (${parseResult.parseable_sections.join(', ')})`
    : `Missing required sections: ${missing.join(', ')}`;

  return { score, details };
}

// ── Build fix priorities ──────────────────────────────────────────────────────

function buildFixPriorities(
  keywordResult: ReturnType<typeof analyzeKeywords>,
  parseResult: ReturnType<typeof analyzeParseIntegrity>,
  _experienceScore: number,
  req: JobRequirements,
): ATSScoreResult['fix_priorities'] {
  const fixes: ATSScoreResult['fix_priorities'] = [];
  let rank = 1;

  // Parse failures first — they're fatal
  if (!parseResult.no_tables_detected) {
    fixes.push({ rank: rank++, impact: 'critical', issue: 'Tables detected in resume', fix: 'Convert all tables to plain bullet lists. Taleo cannot parse table content — it will be lost entirely.', affects_systems: ['Taleo', 'iCIMS', 'Workday'], score_delta_estimate: 18 });
  }
  if (!parseResult.no_columns_detected) {
    fixes.push({ rank: rank++, impact: 'critical', issue: 'Multi-column layout detected', fix: 'Convert to single-column layout. Taleo and iCIMS read columns left-to-right and mix up content.', affects_systems: ['Taleo', 'iCIMS', 'Workday'], score_delta_estimate: 15 });
  }
  if (!parseResult.has_contact_in_body) {
    fixes.push({ rank: rank++, impact: 'critical', issue: 'Contact info missing from body', fix: 'Place name, email, phone in the main document body — not in header/footer. Older ATS skip header/footer entirely.', affects_systems: ['Taleo', 'iCIMS'], score_delta_estimate: 12 });
  }

  // Missing must-have keywords — highest keyword fix priority
  for (const kw of keywordResult.missing_must_have.slice(0, 8)) {
    fixes.push({ rank: rank++, impact: 'high', issue: `Missing required skill: "${kw}"`, fix: `Add "${kw}" verbatim to Skills section AND at least one experience bullet where relevant. Use exact spelling — Taleo and SmartRecruiters match literally.`, affects_systems: ['Taleo', 'SmartRecruiters', 'iCIMS', 'Workday'], score_delta_estimate: Math.round(20 / req.must_have_skills.length) });
  }

  // Section headers
  if (!parseResult.has_standard_headers) {
    fixes.push({ rank: rank++, impact: 'high', issue: `Missing standard sections: ${parseResult.missing_sections.join(', ')}`, fix: 'Use exact headers: "Work Experience", "Education", "Skills". ATS cannot attribute content to candidate fields without these headers.', affects_systems: ['Taleo', 'iCIMS', 'Workday', 'Greenhouse', 'Lever', 'SmartRecruiters'], score_delta_estimate: 10 });
  }

  // Keyword density
  if (keywordResult.density_score < 70) {
    fixes.push({ rank: rank++, impact: 'medium', issue: 'Keyword density below optimal (target 8-12%)', fix: 'Weave job description keywords naturally into experience bullets. Aim for each key skill to appear 2-3 times across the resume.', affects_systems: ['iCIMS', 'Taleo'], score_delta_estimate: 8 });
  }

  // Date format
  if (!parseResult.date_format_consistent) {
    fixes.push({ rank: rank++, impact: 'medium', issue: 'Inconsistent date formats', fix: 'Use MM/YYYY format consistently throughout (e.g. "03/2022 – Present"). Taleo and iCIMS assign incorrect dates when formats are mixed.', affects_systems: ['Taleo', 'iCIMS'], score_delta_estimate: 6 });
  }

  // Keyword placement
  if (keywordResult.placement_score < 60) {
    fixes.push({ rank: rank++, impact: 'medium', issue: 'Key skills only in skills list, not in experience bullets', fix: 'Add 3-5 must-have keywords into experience bullet points. iCIMS and Greenhouse weight keywords found in experience bullets more heavily than skills-list-only.', affects_systems: ['iCIMS', 'Greenhouse'], score_delta_estimate: 7 });
  }

  // Nice-to-have keywords
  for (const kw of keywordResult.missing_nice_to_have.slice(0, 4)) {
    fixes.push({ rank: rank++, impact: 'low', issue: `Missing preferred skill: "${kw}"`, fix: `Add "${kw}" if you have experience with it. This is a preferred (not required) qualification.`, affects_systems: ['iCIMS', 'SmartRecruiters'], score_delta_estimate: 3 });
  }

  return fixes;
}

// ── System verdicts ───────────────────────────────────────────────────────────

function buildSystemVerdicts(
  _totalScore: number,
  parseResult: ReturnType<typeof analyzeParseIntegrity>,
  keywordResult: ReturnType<typeof analyzeKeywords>,
): ATSScoreResult['system_verdicts'] {
  const mustCoverage = keywordResult.coverage_rate;
  const parseOk = parseResult.no_tables_detected && parseResult.no_columns_detected && parseResult.has_contact_in_body;

  // Taleo: exact keywords + parse-safe (strictest)
  const taleoPasses = mustCoverage >= 0.75 && parseOk && parseResult.date_format_consistent && keywordResult.missing_must_have.length === 0;
  // Workday: no auto-score, but fails on parse + keyword gaps in filter
  const workdayPasses = parseOk && mustCoverage >= 0.65;
  // iCIMS: frequency + similarity score
  const icimsPass = mustCoverage >= 0.65 && parseOk;
  // Greenhouse: most lenient, semantic
  const greenhousePasses = mustCoverage >= 0.55 && parseResult.has_standard_headers;
  // Lever: semantic, prefers DOCX
  const leverPasses = mustCoverage >= 0.55 && parseResult.has_standard_headers;
  // SmartRecruiters: exact match, structured fields
  const smartPasses = mustCoverage >= 0.70 && parseOk;

  return {
    taleo: { passes: taleoPasses, reason: taleoPasses ? 'Meets Taleo keyword + parse requirements' : `Taleo issues: ${keywordResult.missing_must_have.length > 0 ? `missing ${keywordResult.missing_must_have.slice(0, 3).join(', ')}` : 'parse formatting problem'}` },
    workday: { passes: workdayPasses, reason: workdayPasses ? 'Passes Workday keyword filters' : 'Insufficient keyword coverage for Workday recruiter filters' },
    icims: { passes: icimsPass, reason: icimsPass ? 'Meets iCIMS similarity score threshold' : 'Low keyword frequency for iCIMS ranking' },
    greenhouse: { passes: greenhousePasses, reason: greenhousePasses ? 'Passes Greenhouse keyword search' : 'Missing keywords for Greenhouse Boolean search' },
    lever: { passes: leverPasses, reason: leverPasses ? 'Passes Lever semantic matching' : 'Insufficient keyword coverage for Lever' },
    smartrecruiters: { passes: smartPasses, reason: smartPasses ? 'Meets SmartRecruiters Fit Score threshold' : 'Missing exact-match keywords SmartRecruiters requires' },
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeATSScore(
  requirements: JobRequirements,
  candidate: ResumeCandidate,
): ATSScoreResult {
  const bullets = candidate.experience.flatMap(e => e.bullets);
  const skillsText = candidate.skills.concat(candidate.tools).join(' ');

  // Run analyzers
  const keywordResult = analyzeKeywords(requirements, candidate.resume_text, bullets, skillsText);
  const parseResult = analyzeParseIntegrity(candidate.resume_text);
  const expMatch = scoreExperienceMatch(requirements, candidate);
  const sectionComp = scoreSectionCompleteness(parseResult);

  // Keyword coverage score (0-100): blend of coverage rate + density
  const keywordScore = 0.70 * (keywordResult.coverage_rate * 100) + 0.30 * keywordResult.density_score;

  // Weights
  const W = { keyword: 0.35, parse: 0.20, experience: 0.18, sections: 0.12, placement: 0.10, formatting: 0.05 };

  const dims = {
    keyword_coverage: scoreDimension(keywordScore, W.keyword, 'Keyword Coverage', `${keywordResult.matched_exact.length + keywordResult.matched_synonym.length}/${keywordResult.total_jd_keywords} keywords matched. Density score: ${keywordResult.density_score}`, { matched: [...keywordResult.matched_exact, ...keywordResult.matched_synonym], missing: keywordResult.missing_must_have }),
    parse_integrity: scoreDimension(parseResult.score, W.parse, 'Parse Integrity', parseResult.warnings.length === 0 ? 'No parse issues detected' : parseResult.warnings[0], { warnings: parseResult.warnings }),
    experience_match: scoreDimension(expMatch.score, W.experience, 'Experience Match', expMatch.details),
    section_completeness: scoreDimension(sectionComp.score, W.sections, 'Section Completeness', sectionComp.details),
    keyword_placement: scoreDimension(keywordResult.placement_score, W.placement, 'Keyword Placement', 'Keywords in experience bullets vs skills list only'),
    formatting_details: scoreDimension(parseResult.date_format_consistent ? 90 : 50, W.formatting, 'Formatting Details', parseResult.date_format_consistent ? 'Date formats consistent' : 'Inconsistent date formats detected'),
  };

  // Weighted total
  const totalWeight = Object.values(W).reduce((s, w) => s + w, 0);
  const raw = Object.entries(dims).reduce((sum, [, dim]) => {
    return sum + (dim.score * dim.weight);
  }, 0) / totalWeight;

  const total_score = Math.round(clip(raw, 0, 100));

  const band: ATSScoreResult['band'] =
    total_score >= 80 ? 'elite' :
    total_score >= 65 ? 'strong' :
    total_score >= 50 ? 'needs-work' : 'failing';

  // Hard gate: if 2+ must-haves missing, gate blocks regardless of total score
  const hard_gate_passed = keywordResult.missing_must_have.length <= 1;
  const hard_gate_reason = hard_gate_passed
    ? `Gate passed — ${requirements.must_have_skills.length - keywordResult.missing_must_have.length}/${requirements.must_have_skills.length} must-haves present`
    : `Gate blocked — missing critical requirements: ${keywordResult.missing_must_have.slice(0, 5).join(', ')}`;

  // Confidence: based on resume text richness
  const wordCount = candidate.resume_text.split(/\s+/).length;
  const confidence = clip(wordCount / 500, 0.3, 1.0);

  const systemVerdicts = buildSystemVerdicts(total_score, parseResult, keywordResult);
  const fixPriorities = buildFixPriorities(keywordResult, parseResult, expMatch.score, requirements);

  return {
    total_score,
    band,
    confidence,
    hard_gate_passed,
    hard_gate_reason,
    dimensions: dims,
    keyword_analysis: keywordResult,
    parse_analysis: parseResult,
    fix_priorities: fixPriorities,
    system_verdicts: systemVerdicts,
  };
}
