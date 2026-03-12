/**
 * JD Intelligence Engine — Elite Part 1
 */
import { callClaude } from './anthropic';

export interface JDIntelligence {
  implicit_requirements: string[];
  domain_detected: 'trading' | 'saas' | 'enterprise' | 'startup' | 'fintech' | 'healthcare' | 'general';
  environment: 'regulated' | 'startup' | 'enterprise' | 'hybrid' | null;
  hidden_must_haves: string[];
  difficulty_level: number;
  risk_sensitivity: ('security' | 'compliance' | 'latency' | 'scale' | 'none')[];
}

export async function extractJDIntelligence(
  jobTitle: string,
  jobDescription: string,
  // TODO: ATS scoring replaced — rewire to new engine types at src/lib/ats/
  baseRequirements?: Partial<{ domain?: string }>
): Promise<JDIntelligence | null> {
  try {
    const jd = (jobDescription || '').slice(0, 4000);
    const prompt = `Analyze this job for implicit requirements. JOB: ${jobTitle}. JD: ${jd}. ${baseRequirements?.domain ? `Base domain: ${baseRequirements.domain}` : ''} Return ONLY valid JSON: {"implicit_requirements":[],"domain_detected":"trading|saas|enterprise|startup|fintech|healthcare|general","environment":"regulated|startup|enterprise|hybrid|null","hidden_must_haves":[],"difficulty_level":1-5,"risk_sensitivity":["security","compliance","latency","scale"] or ["none"]}`;
    const text = await callClaude(prompt, { maxTokens: 800 });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      implicit_requirements: Array.isArray(parsed.implicit_requirements) ? parsed.implicit_requirements : [],
      domain_detected: ['trading', 'saas', 'enterprise', 'startup', 'fintech', 'healthcare', 'general'].includes(parsed.domain_detected) ? parsed.domain_detected : 'general',
      environment: ['regulated', 'startup', 'enterprise', 'hybrid'].includes(parsed.environment) ? parsed.environment : null,
      hidden_must_haves: Array.isArray(parsed.hidden_must_haves) ? parsed.hidden_must_haves : [],
      difficulty_level: Math.min(5, Math.max(1, Number(parsed.difficulty_level) || 3)),
      risk_sensitivity: Array.isArray(parsed.risk_sensitivity) ? parsed.risk_sensitivity.filter((s: string) => ['security', 'compliance', 'latency', 'scale', 'none'].includes(s)) : ['none'],
    };
  } catch {
    return null;
  }
}
