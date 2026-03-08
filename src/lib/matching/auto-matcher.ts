/**
 * Auto-matching engine: AI-powered job–candidate scoring and notifications.
 * Used by EventBridge match handler and optional cron.
 */

import { createServiceClient } from '@/lib/supabase-server';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

export type Job = {
  id: string;
  title: string;
  company: string;
  jd_clean?: string | null;
  jd_raw?: string | null;
  requirements?: string | null;
  description?: string | null;
};

export type Candidate = {
  id: string;
  full_name: string;
  primary_title?: string | null;
  years_of_experience?: number | null;
  skills?: string[] | unknown;
  parsed_resume_text?: string | null;
  experience?: unknown;
};

export type Match = {
  job_id: string;
  candidate_id: string;
  score: number;
  reasoning?: string;
  strengths?: string[];
  gaps?: string[];
  recommendation?: string;
  matched_at: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function skillsStr(skills: unknown): string {
  if (!skills) return '';
  if (Array.isArray(skills)) return skills.map(String).join(', ');
  if (typeof skills === 'string') return skills;
  return String(skills);
}

export class AutoMatcher {
  private supabase = createServiceClient();

  async getNewJobs(limit: number, hoursBack = 2): Promise<Job[]> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('jobs')
      .select('id, title, company, jd_clean, jd_raw')
      .eq('is_active', true)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data || []) as Job[];
  }

  async getActiveCandidates(): Promise<Candidate[]> {
    const { data, error } = await this.supabase
      .from('candidates')
      .select('id, full_name, primary_title, years_of_experience, skills, parsed_resume_text, experience')
      .eq('active', true)
      .not('invite_accepted_at', 'is', null);
    if (error) return [];
    return (data || []) as Candidate[];
  }

  async calculateMatch(job: Job, candidate: Candidate): Promise<Match | null> {
    if (!ANTHROPIC_KEY) return null;
    const jd = (job.jd_clean || job.jd_raw || job.description || '').slice(0, 4000);
    const resumeSummary = (candidate.parsed_resume_text || '').slice(0, 1500);
    const prompt = `Analyze job-candidate fit.

JOB:
Title: ${job.title}
Company: ${job.company}
Requirements: ${(job as any).requirements || 'See description'}
Description: ${jd}

CANDIDATE:
Name: ${candidate.full_name}
Title: ${candidate.primary_title || 'N/A'}
Experience: ${candidate.years_of_experience ?? 'N/A'} years
Skills: ${skillsStr(candidate.skills)}
Resume: ${resumeSummary || 'No resume text'}

Score this match 0-100 based on:
1. Skills alignment (40%)
2. Experience level (30%)
3. Role fit (20%)
4. Cultural fit indicators (10%)

Return JSON only, no markdown:
{"score": 85, "reasoning": "Strong match - 5 years Python, ML experience matches requirements", "strengths": ["Python expert", "ML background"], "gaps": ["No AWS certification"], "recommendation": "Interview"}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text = (data.content?.[0]?.text || '{}').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      const score = Math.min(100, Math.max(0, Number(parsed.score) || 0));
      return {
        job_id: job.id,
        candidate_id: candidate.id,
        score,
        reasoning: parsed.reasoning,
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
        recommendation: parsed.recommendation,
        matched_at: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  async matchJobToCandidates(job: Job, candidates: Candidate[], batchSize = 10): Promise<Match[]> {
    const batches = chunk(candidates, batchSize);
    const allMatches: Match[] = [];
    for (const batch of batches) {
      const results = await Promise.all(batch.map(c => this.calculateMatch(job, c)));
      for (const m of results) if (m) allMatches.push(m);
    }
    return allMatches.sort((a, b) => b.score - a.score);
  }

  async saveMatches(matches: Match[]): Promise<void> {
    if (!matches.length) return;
    const now = new Date().toISOString();
    const rows = matches.map(m => ({
      candidate_id: m.candidate_id,
      job_id: m.job_id,
      ats_score: m.score,
      ats_reason: m.reasoning ?? null,
      ats_breakdown: {
        strengths: m.strengths,
        gaps: m.gaps,
        recommendation: m.recommendation,
        source: 'auto_matcher',
      },
      ats_checked_at: now,
      matched_at: m.matched_at,
      fit_score: m.score,
      match_reason: 'AI auto-match',
    }));
    await this.supabase.from('candidate_job_matches').upsert(rows, { onConflict: 'candidate_id,job_id' });
  }

  async notifyMatches(matches: Match[]): Promise<void> {
    for (const match of matches) {
      await this.sendRecruiterNotification(match);
      await this.sendCandidateNotification(match);
    }
  }

  private async sendRecruiterNotification(match: Match): Promise<void> {
    try {
      await this.supabase.from('ats_events').insert({
        event_type: 'auto_match_high_score',
        event_source: 'auto_matcher',
        candidate_id: match.candidate_id,
        job_id: match.job_id,
        payload: { score: match.score, reasoning: match.reasoning, strengths: match.strengths, gaps: match.gaps },
      });
    } catch {
      // ats_events insert best-effort
    }
  }

  private async sendCandidateNotification(match: Match): Promise<void> {
    try {
      await this.supabase.from('ats_events').insert({
        event_type: 'candidate_match_notification',
        event_source: 'auto_matcher',
        candidate_id: match.candidate_id,
        job_id: match.job_id,
        payload: { score: match.score },
      });
    } catch {
      // ats_events insert best-effort
    }
  }

  async matchNewJobs(options: {
    jobsAdded?: number;
    minScore?: number;
    notifyThreshold?: number;
    hoursBack?: number;
  }): Promise<{
    totalMatches: number;
    highScoreMatches: number;
    jobsProcessed: number;
    candidatesChecked: number;
  }> {
    const { jobsAdded = 500, minScore = 70, notifyThreshold = 85, hoursBack = 2 } = options;
    const newJobs = await this.getNewJobs(jobsAdded, hoursBack);
    const candidates = await this.getActiveCandidates();
    if (!newJobs.length || !candidates.length) {
      return { totalMatches: 0, highScoreMatches: 0, jobsProcessed: newJobs.length, candidatesChecked: candidates.length };
    }

    const matches: Match[] = [];
    for (const job of newJobs) {
      const jobMatches = await this.matchJobToCandidates(job, candidates);
      matches.push(...jobMatches.filter(m => m.score >= minScore));
    }

    await this.saveMatches(matches);
    const highScore = matches.filter(m => m.score >= notifyThreshold);
    await this.notifyMatches(highScore);

    return {
      totalMatches: matches.length,
      highScoreMatches: highScore.length,
      jobsProcessed: newJobs.length,
      candidatesChecked: candidates.length,
    };
  }
}
