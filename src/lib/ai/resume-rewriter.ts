/**
 * Intelligent Resume Rewriter — Elite Part 1
 *
 * AI rewrites bullets for domain-specific context:
 * - Inject concurrency/scale language when required
 * - Transform generic → trading-grade / enterprise-grade
 * - Reduce risk perception
 * - Add quantifiable metrics where consistent
 * - Remove fluff
 * - Expected ATS uplift estimate
 */

import { callClaude } from './anthropic';

export interface RewriteResult {
  original: string;
  rewritten: string;
  expected_ats_lift: number; // -5 to +15 points
  changes_made: string[];
}

export async function rewriteBulletIntelligent(
  bullet: string,
  jobTitle: string,
  jobDomain: string,
  missingSkills: string[],
  riskSensitivity: string[] = []
): Promise<RewriteResult | null> {
  try {
    const prompt = `You are an elite resume coach. Rewrite this resume bullet for the target role.

BULLET: ${bullet}
JOB: ${jobTitle}
DOMAIN: ${jobDomain}
MISSING SKILLS TO INCORPORATE: ${missingSkills.slice(0, 5).join(', ') || 'None'}
RISK SENSITIVITY (role cares about): ${riskSensitivity.join(', ') || 'general'}

Rules:
- Inject domain-appropriate language (e.g. concurrency/scale for trading; reliability for enterprise)
- Add [METRIC_NEEDED] where a number would strengthen (%, $, 2x)
- Add [TOOL_NEEDED] where a specific tech would help
- Remove fluff and generic phrases
- Keep under 100 chars
- Do NOT fabricate — only transform what's implied

Return ONLY valid JSON:
{
  "rewritten": "the rewritten bullet",
  "expected_ats_lift": 0-15 (estimated point gain from this bullet alone),
  "changes_made": ["change1", "change2"]
}`;

    const text = await callClaude(prompt, { maxTokens: 300 });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const lift = Math.min(15, Math.max(-5, Number(parsed.expected_ats_lift) || 0));
    return {
      original: bullet,
      rewritten: String(parsed.rewritten || bullet),
      expected_ats_lift: lift,
      changes_made: Array.isArray(parsed.changes_made) ? parsed.changes_made : [],
    };
  } catch {
    return null;
  }
}

export async function rewriteBulletsBatch(
  bullets: string[],
  jobTitle: string,
  jobDomain: string,
  missingSkills: string[],
  riskSensitivity: string[] = []
): Promise<RewriteResult[]> {
  const results: RewriteResult[] = [];
  for (const b of bullets.slice(0, 8)) {
    const r = await rewriteBulletIntelligent(b, jobTitle, jobDomain, missingSkills, riskSensitivity);
    if (r) results.push(r);
  }
  return results;
}
