/**
 * Interview Objection Predictor — Elite Part 1
 */
import { callClaude } from './anthropic';

export interface ObjectionPrediction {
  rejection_reasons: Array<{ reason: string; likelihood: string; detail: string }>;
  trust_gaps: string[];
  inflation_risks: string[];
  defense_talking_points: Array<{ objection: string; response: string }>;
}

export async function predictObjections(
  jobTitle: string,
  jobCompany: string,
  jdExcerpt: string,
  candidateTitle: string,
  candidateBullets: string[],
  missingSkills: string[],
  atsScore: number
): Promise<ObjectionPrediction | null> {
  try {
    const prompt = `Simulate hiring manager. Job: ${jobTitle} at ${jobCompany}. Candidate: ${candidateTitle}. ATS: ${atsScore}. Missing: ${missingSkills.slice(0, 8).join(', ')}. JD: ${(jdExcerpt || '').slice(0, 1200)}. Bullets: ${(candidateBullets || []).slice(0, 8).map((b: string) => b.slice(0, 80)).join(' | ')}. Return JSON: {"rejection_reasons":[{"reason":"","likelihood":"high|medium|low","detail":""}],"trust_gaps":[],"inflation_risks":[],"defense_talking_points":[{"objection":"","response":""}]} Limit 5 each.`;
    const text = await callClaude(prompt, { maxTokens: 1200 });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      rejection_reasons: (parsed.rejection_reasons || []).slice(0, 5),
      trust_gaps: Array.isArray(parsed.trust_gaps) ? parsed.trust_gaps.slice(0, 5) : [],
      inflation_risks: Array.isArray(parsed.inflation_risks) ? parsed.inflation_risks.slice(0, 3) : [],
      defense_talking_points: (parsed.defense_talking_points || []).slice(0, 5),
    };
  } catch {
    return null;
  }
}
