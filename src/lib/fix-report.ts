/**
 * Fix Report — actionable recommendations to improve ATS score
 *
 * Takes score breakdown and produces concrete, prioritized steps.
 * Deterministic: no AI for structure. Claude can add human-readable summary.
 */

export interface FixReportInput {
  total_score: number;
  dimensions?: Record<string, { score: number; details: string; matched?: string[]; missing?: string[] }>;
  matched_keywords?: string[];
  missing_keywords?: string[];
  evidence_spans?: Array<{ skill: string; resume_snippet: string; requirement_source?: string }>;
  gate_passed?: boolean;
  negative_signals?: Array<{ type: string; severity: string; detail: string }>;
}

export interface FixRecommendation {
  priority: 'high' | 'medium' | 'low';
  dimension: string;
  title: string;
  action: string;
  /** Placeholders for bullet rewrites: [METRIC_NEEDED], [TOOL_NEEDED] */
  placeholders?: string[];
}

export interface FixReportOutput {
  score: number;
  band: 'elite' | 'strong' | 'possible' | 'weak';
  summary: string;
  recommendations: FixRecommendation[];
  /** Skills to add with evidence in bullets */
  add_to_bullets: string[];
  /** Skills currently only in list — need bullet evidence */
  skills_needing_evidence: string[];
}

const DIMENSION_LABELS: Record<string, string> = {
  must: 'Must-have skills',
  nice: 'Nice-to-have skills',
  parse: 'Resume structure',
  resp: 'Responsibility alignment',
  impact: 'Impact & metrics',
  scope: 'Experience & scale',
  recent: 'Skill recency',
  domain: 'Role alignment',
  risk: 'Risk factors',
};

export function buildFixReport(input: FixReportInput): FixReportOutput {
  const dims = input.dimensions || {};
  const missing = input.missing_keywords || dims.must?.missing || [];
  const matched = input.matched_keywords || dims.must?.matched || [];
  const evidenceSpans = input.evidence_spans || [];

  const recommendations: FixRecommendation[] = [];
  const addToBullets: string[] = [];
  const skillsNeedingEvidence: string[] = [];

  // Must-have skills: missing = highest priority
  if (missing.length > 0) {
    recommendations.push({
      priority: 'high',
      dimension: 'must',
      title: 'Add missing required skills',
      action: `Add these skills to your resume with evidence in bullets, not just the skills section: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}. Use [TOOL_NEEDED] where you'd mention the tool and [METRIC_NEEDED] for quantified impact.`,
      placeholders: ['[TOOL_NEEDED]', '[METRIC_NEEDED]'],
    });
    addToBullets.push(...missing);
  }

  // Skills in matched but weak evidence (only in list, not bullets)
  const matchedWithEvidence = new Set((evidenceSpans || []).map(s => s.skill.toLowerCase()));
  for (const m of matched) {
    if (!matchedWithEvidence.has(m.toLowerCase())) {
      skillsNeedingEvidence.push(m);
    }
  }
  if (skillsNeedingEvidence.length > 0) {
    recommendations.push({
      priority: 'high',
      dimension: 'must',
      title: 'Evidence skills in bullets',
      action: `These skills appear in your resume but need stronger evidence in experience bullets: ${skillsNeedingEvidence.slice(0, 5).join(', ')}. Add bullets that describe what you built or improved using them.`,
    });
  }

  // Impact dimension — add quantified metrics
  const impactScore = dims.impact?.score ?? dims.behavioral?.score;
  if (typeof impactScore === 'number' && impactScore < 70) {
    recommendations.push({
      priority: 'high',
      dimension: 'impact',
      title: 'Add quantified impact to bullets',
      action: 'Add numbers to your experience bullets: percentages (e.g. "reduced latency by 40%"), dollar amounts ("saved $2M"), or multipliers ("2x faster"). Use [METRIC_NEEDED] as a placeholder where a number would go.',
      placeholders: ['[METRIC_NEEDED]'],
    });
  }

  // Responsibility alignment
  const respScore = dims.resp?.score;
  if (typeof respScore === 'number' && respScore < 60) {
    recommendations.push({
      priority: 'medium',
      dimension: 'resp',
      title: 'Align bullets with job duties',
      action: 'Reframe your resume bullets to mirror the job description\'s core responsibilities. Use similar action verbs and focus on the same types of outcomes the role emphasizes.',
    });
  }

  // Parse / structure
  const parseScore = dims.parse?.score ?? dims.formatting?.score;
  if (typeof parseScore === 'number' && parseScore < 60) {
    recommendations.push({
      priority: 'medium',
      dimension: 'parse',
      title: 'Improve resume structure',
      action: 'Ensure you have clear sections: Skills, Experience (with dates), Education. Add bullet points (•) for each responsibility. Include contact info and LinkedIn/GitHub if relevant.',
    });
  }

  // Scope (years, leadership)
  const scopeScore = dims.scope?.score ?? dims.experience?.score;
  if (typeof scopeScore === 'number' && scopeScore < 60) {
    recommendations.push({
      priority: 'medium',
      dimension: 'scope',
      title: 'Highlight experience and leadership',
      action: 'Add dates to all roles. If you led projects or mentored others, make it explicit. Quantify team size or scope (e.g. "led 5-engineer team").',
    });
  }

  // Negative signals (job hopping, gaps, inflated title)
  if (input.negative_signals && input.negative_signals.length > 0) {
    const high = input.negative_signals.filter(s => s.severity === 'high');
    if (high.length > 0) {
      recommendations.push({
        priority: 'medium',
        dimension: 'risk',
        title: 'Address resume concerns',
        action: high.map(s => s.detail).join('. ') + '. Consider clarifying overlapping roles, explaining career gaps, or aligning title with experience level.',
      });
    }
  }

  // Domain
  const domainScore = dims.domain?.score ?? dims.title?.score;
  if (typeof domainScore === 'number' && domainScore < 60) {
    recommendations.push({
      priority: 'low',
      dimension: 'domain',
      title: 'Clarify role alignment',
      action: 'Use a title or summary that clearly matches the job domain. If you have relevant experience under a different title, highlight it in your summary.',
    });
  }

  const band = input.total_score >= 90 ? 'elite' : input.total_score >= 80 ? 'strong' : input.total_score >= 70 ? 'possible' : 'weak';
  const summary = band === 'elite'
    ? 'Your resume is in the top tier. Minor refinements can help.'
    : band === 'strong'
    ? 'Strong match. Focus on the highest-priority items below to reach elite.'
    : band === 'possible'
    ? 'You have potential. Address the high-priority recommendations to improve your score.'
    : 'Several gaps need addressing. Start with missing must-have skills and impact metrics.';

  return {
    score: input.total_score,
    band,
    summary,
    recommendations: recommendations.slice(0, 8),
    add_to_bullets: Array.from(new Set(addToBullets)),
    skills_needing_evidence: Array.from(new Set(skillsNeedingEvidence)),
  };
}
