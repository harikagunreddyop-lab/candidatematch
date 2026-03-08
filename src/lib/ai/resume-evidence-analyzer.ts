/**
 * Resume Evidence Analyzer — Elite Part 1
 * AI augments scoring: weak bullets, overclaim, skill credibility.
 */

import { callClaude } from './anthropic';
import type { EvidenceSpan } from '@/lib/ats-engine';

export interface ResumeEvidenceFinding {
  type: 'weak_bullet' | 'overclaim' | 'inflated_tools' | 'missing_depth' | 'skill_credibility';
  severity: 'high' | 'medium' | 'low';
  snippet?: string;
  skill?: string;
  explanation: string;
  suggestion?: string;
}

export interface ResumeEvidenceAnalysis {
  findings: ResumeEvidenceFinding[];
  summary: string;
}

export async function analyzeResumeEvidence(
  resumeText: string,
  matchedSkills: string[],
  missingSkills: string[],
  _evidenceSpans: EvidenceSpan[],
  jobDomain?: string
): Promise<ResumeEvidenceAnalysis | null> {
  try {
    const bullets = (resumeText || '').split(/\n/).filter(l => /^[\s]*[•\-*]/.test(l) || /^\d+\./.test(l)).map(l => l.replace(/^[\s•\-*\d.]+\s*/, '').trim()).filter(Boolean).slice(0, 20);
    const prompt = `Analyze resume bullets. Matched: ${matchedSkills.slice(0, 15).join(', ')}. Missing: ${missingSkills.slice(0, 10).join(', ')}. Domain: ${jobDomain || 'general'}.
Bullets: ${JSON.stringify(bullets.slice(0, 15))}
Return JSON: {"findings":[{"type":"weak_bullet|overclaim|inflated_tools|missing_depth|skill_credibility","severity":"high|medium|low","explanation":"...","suggestion":"..."}],"summary":"..."}
Limit 8 findings.`;
    const text = await callClaude(prompt, { maxTokens: 1200 });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const findings: ResumeEvidenceFinding[] = (parsed.findings || []).slice(0, 8).map((f: Record<string, unknown>) => ({
      type: ['weak_bullet', 'overclaim', 'inflated_tools', 'missing_depth', 'skill_credibility'].includes(f.type as string) ? f.type : 'skill_credibility',
      severity: ['high', 'medium', 'low'].includes(f.severity as string) ? f.severity : 'medium',
      snippet: f.snippet as string,
      skill: f.skill as string,
      explanation: String(f.explanation || ''),
      suggestion: f.suggestion as string,
    }));
    return { findings, summary: String(parsed.summary || '') };
  } catch {
    return null;
  }
}
