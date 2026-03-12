import { callClaude } from './anthropic';

export interface HumanReadableExplanation {
  narrative: string;
  risk_summary: string;
  audit_summary: string;
}

export async function explainATSScore(
  // TODO: ATS scoring replaced — rewire to new engine types at src/lib/ats/
  result: { total_score: number; dimensions?: Record<string, { score?: number }> },
  jobTitle: string,
  _candidateTitle?: string,
): Promise<HumanReadableExplanation | null> {
  try {
    const dims = result.dimensions || {};
    const dimSummary = Object.entries(dims).map(([k, v]) => k + ': ' + ((v as any).score ?? 0)).join(', ');
    const prompt = 'ATS breakdown. Job: ' + jobTitle + '. Score: ' + result.total_score + '. ' + dimSummary + '. Return JSON: {"narrative":"","risk_summary":"","audit_summary":""}';
    const text = await callClaude(prompt, { maxTokens: 600 });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return { narrative: String(parsed.narrative || ''), risk_summary: String(parsed.risk_summary || ''), audit_summary: String(parsed.audit_summary || '') };
  } catch { return null; }
}
