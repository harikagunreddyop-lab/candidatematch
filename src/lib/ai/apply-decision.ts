import { callClaude } from './anthropic';

export type ApplyRecommendation = 'apply_now' | 'tailor_first' | 'avoid' | 'wait';

export interface ApplyDecision {
  recommendation: ApplyRecommendation;
  reasoning: string;
  confidence: number;
  tailor_focus?: string[];
}

export async function getApplyDecision(
  jobTitle: string,
  company: string,
  atsScore: number,
  missingSkills: string[],
  matchedSkills: string[],
  gatePassed: boolean
): Promise<ApplyDecision | null> {
  try {
    const prompt = `Job: ${jobTitle} at ${company}. ATS: ${atsScore}. Gate: ${gatePassed}. Suggest apply_now|tailor_first|avoid|wait. Return JSON: {"recommendation":"","reasoning":"","confidence":0.5,"tailor_focus":[]}`;
    const text = await callClaude(prompt, { maxTokens: 400 });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const valid: ApplyRecommendation[] = ['apply_now', 'tailor_first', 'avoid', 'wait'];
    const rec = parsed.recommendation;
    return {
      recommendation: valid.includes(rec) ? rec : (atsScore >= 80 ? 'apply_now' : atsScore >= 61 ? 'tailor_first' : 'avoid'),
      reasoning: String(parsed.reasoning || ''),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      tailor_focus: Array.isArray(parsed.tailor_focus) ? parsed.tailor_focus.slice(0, 5) : undefined,
    };
  } catch {
    return null;
  }
}
