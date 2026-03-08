import { extractImpactFromExperience } from '@/lib/impact-extractor';
import { canonicalize } from '@/lib/skill-ontology';

export interface ResumeIntelligenceResult {
  credibility_score: number;
  impact_density: number;
  missing_skills: string[];
  resume_quality_band: 'elite' | 'strong' | 'ok' | 'weak';
}

function computeCredibilityScore(resumeText: string): number {
  if (!resumeText || resumeText.length < 400) return 40;
  const bullets = (resumeText.match(/^[\s]*[•\-\*]\s/mg) || []).length;
  const dates = (resumeText.match(/\b(20\d{2}|19\d{2})\b/g) || []).length;
  const buzzwords = (resumeText.match(/\b(synergy|leverage|best.of.breed|thought.leader|rockstar|ninja)\b/gi) || []).length;
  let score = 50;
  if (bullets >= 10) score += 15;
  if (dates >= 6) score += 15;
  if (buzzwords >= 3) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function computeImpactDensity(_resumeText: string, experience: Array<{ responsibilities?: string[] }>): number {
  const impact = extractImpactFromExperience(experience);
  const totalBullets = experience.flatMap(e => e.responsibilities || []).length || 1;
  return Math.max(0, Math.min(100, Math.round((impact.bulletsWithImpact / totalBullets) * 100)));
}

export function analyzeResume(
  resumeText: string,
  experience: Array<{ responsibilities?: string[] }>,
  requiredSkills: string[],
  candidateSkills: string[],
): ResumeIntelligenceResult {
  const credibility = computeCredibilityScore(resumeText);
  const impactDensity = computeImpactDensity(resumeText, experience);

  const candSet = new Set(candidateSkills.map(canonicalize));
  const missing = requiredSkills
    .map(canonicalize)
    .filter(s => s && !candSet.has(s));

  let band: ResumeIntelligenceResult['resume_quality_band'] = 'weak';
  const composite = 0.6 * credibility + 0.4 * impactDensity;
  if (composite >= 85) band = 'elite';
  else if (composite >= 70) band = 'strong';
  else if (composite >= 55) band = 'ok';

  return {
    credibility_score: Math.round(credibility),
    impact_density: Math.round(impactDensity),
    missing_skills: Array.from(new Set(missing)).slice(0, 15),
    resume_quality_band: band,
  };
}

