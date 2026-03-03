/**
 * Pipeline Risk Detection — Elite Part 3
 */

import { callClaude } from './anthropic';

export interface PipelineRisk {
  type: 'stalled' | 'ghosting' | 'recruiter_inactive' | 'candidate_disengagement';
  severity: 'high' | 'medium' | 'low';
  application_id?: string;
  description: string;
  suggested_action?: string;
}

export interface PipelineRiskReport {
  risks: PipelineRisk[];
  summary: string;
}

export interface ApplicationSnapshot {
  id: string;
  job_title: string;
  company: string;
  status: string;
  applied_at: string;
  updated_at: string;
  days_since_update: number;
}

export async function detectPipelineRisks(
  applications: ApplicationSnapshot[],
  candidateName?: string
): Promise<PipelineRiskReport | null> {
  if (applications.length === 0) return { risks: [], summary: 'No applications to analyze.' };
  try {
    const appsJson = JSON.stringify(applications.slice(0, 20));
    const prompt = `Pipeline health. Candidate: ${candidateName || 'Candidate'}. Apps: ${appsJson}. Identify stalled, ghosting, recruiter_inactive, candidate_disengagement. Return JSON: {"risks":[{"type":"","severity":"","application_id":"","description":"","suggested_action":""}],"summary":""} Limit 8 risks.`;
    const text = await callClaude(prompt, { maxTokens: 800 });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const risks: PipelineRisk[] = (parsed.risks || []).slice(0, 8).map((r: Record<string, unknown>) => ({
      type: ['stalled', 'ghosting', 'recruiter_inactive', 'candidate_disengagement'].includes(r.type as string) ? r.type as PipelineRisk['type'] : 'stalled',
      severity: ['high', 'medium', 'low'].includes(r.severity as string) ? r.severity as PipelineRisk['severity'] : 'medium',
      application_id: r.application_id as string,
      description: String(r.description || ''),
      suggested_action: r.suggested_action as string,
    }));
    return { risks, summary: String(parsed.summary || '') };
  } catch {
    return null;
  }
}
