/**
 * Auto-matching engine: AI-powered job–candidate scoring and notifications.
 * Used by EventBridge match handler and optional cron.
 */

import { createServiceClient } from '@/lib/supabase-server';

export type Job = {
  id: string;
  title: string;
  company: string;
  jd_clean?: string | null;
  jd_raw?: string | null;
  must_have_skills?: string[] | null;
  nice_to_have_skills?: string[] | null;
};

export type Candidate = {
  id: string;
  full_name: string;
  primary_title?: string | null;
  target_job_titles?: string[] | null;
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

function normalizeTerm(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9#+.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(str: string): Set<string> {
  return new Set(
    normalizeTerm(str)
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

function titleScore(candidate: Candidate, job: Job): number {
  const titles: string[] = [];
  if (candidate.primary_title) titles.push(candidate.primary_title);
  if (Array.isArray(candidate.target_job_titles)) titles.push(...candidate.target_job_titles);
  if (!titles.length || !job.title) return 0;

  const jobTokens = tokenSet(job.title);
  if (!jobTokens.size) return 0;

  const candTokens = new Set<string>();
  for (const t of titles) {
    for (const tok of tokenSet(t)) candTokens.add(tok);
  }

  let overlap = 0;
  for (const tok of jobTokens) {
    if (candTokens.has(tok)) overlap++;
  }
  return (overlap / jobTokens.size) * 100;
}

function skillsScore(candidate: Candidate, job: Job): number {
  const candSkills = Array.isArray(candidate.skills) ? candidate.skills : [];
  const jobSkills = [
    ...(Array.isArray(job.must_have_skills) ? job.must_have_skills : []),
    ...(Array.isArray(job.nice_to_have_skills) ? job.nice_to_have_skills : []),
  ];
  if (!candSkills.length || !jobSkills.length) return 0;

  const candSet = new Set(candSkills.map((s) => normalizeTerm(String(s))));
  const jobSet = new Set(jobSkills.map((s) => normalizeTerm(String(s))));

  let overlap = 0;
  for (const s of jobSet) {
    if (candSet.has(s)) overlap++;
  }
  return (overlap / jobSet.size) * 100;
}

export class AutoMatcher {
  private supabase = createServiceClient();

  async getNewJobs(limit: number, hoursBack = 2): Promise<Job[]> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('jobs')
      .select('id, title, company, jd_clean, jd_raw, must_have_skills, nice_to_have_skills')
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
      .select('id, full_name, primary_title, target_job_titles, years_of_experience, skills, parsed_resume_text, experience')
      .eq('active', true)
      .not('invite_accepted_at', 'is', null);
    if (error) return [];
    return (data || []) as Candidate[];
  }

  async calculateMatch(job: Job, candidate: Candidate): Promise<Match | null> {
    const titleComponent = titleScore(candidate, job);
    const skillsComponent = skillsScore(candidate, job);

    const score = Math.round(skillsComponent * 0.6 + titleComponent * 0.4);
    if (score <= 0) return null;

    return {
      job_id: job.id,
      candidate_id: candidate.id,
      score,
      reasoning: `Matched on titles and skills (title: ${Math.round(titleComponent)}%, skills: ${Math.round(skillsComponent)}%)`,
      strengths: [],
      gaps: [],
      recommendation: undefined,
      matched_at: new Date().toISOString(),
    };
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
    const { jobsAdded = 500, minScore = 50, notifyThreshold = 85, hoursBack = 24 } = options;
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
