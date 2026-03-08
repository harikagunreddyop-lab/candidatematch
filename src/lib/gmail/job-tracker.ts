/**
 * Auto-track candidate job applications from Gmail: parse emails, match to jobs/applications, update status.
 */

import { createServiceClient } from '@/lib/supabase-server';
import { refreshAccessToken } from '@/lib/gmail-oauth';
import { listMessages, fetchMessageFull } from '@/lib/gmail-sync';
import { EmailParser, mapToApplicationStatus } from '@/lib/gmail/email-parser';
import { createHash } from 'crypto';

const APPLICATION_STATUSES = ['ready', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'] as const;

function toApplicationStatus(s: string): (typeof APPLICATION_STATUSES)[number] {
  const mapped = mapToApplicationStatus(s);
  if (mapped && APPLICATION_STATUSES.includes(mapped as any)) return mapped as (typeof APPLICATION_STATUSES)[number];
  return 'applied';
}

export interface JobTrackerResult {
  emailsScanned: number;
  jobsDetected: number;
  autoUpdates: number;
  detections: Array<{ company: string; jobTitle: string; status: string; subject: string }>;
}

export interface GmailConnectionRow {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

async function getValidAccessToken(conn: GmailConnectionRow): Promise<string> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60_000) return conn.access_token;
  if (!conn.refresh_token) throw new Error('Refresh token missing');
  const refreshed = await refreshAccessToken(conn.refresh_token);
  return refreshed.access_token;
}

export class JobTracker {
  private supabase = createServiceClient();
  private parser = new EmailParser();

  /**
   * Track applications for a candidate: fetch recent job-related emails, parse with AI, update application status.
   */
  async trackApplications(candidateId: string, gmailConnection: GmailConnectionRow): Promise<JobTrackerResult> {
    const accessToken = await getValidAccessToken(gmailConnection);
    const query = 'subject:(application OR interview OR offer OR rejection OR "next step") newer_than:7d';
    const messageList = await listMessages(accessToken, query, 50);

    const result: JobTrackerResult = {
      emailsScanned: messageList.length,
      jobsDetected: 0,
      autoUpdates: 0,
      detections: [],
    };

    for (const { id } of messageList) {
      let email: { subject: string; from: string; body: string };
      try {
        email = await fetchMessageFull(accessToken, id);
      } catch {
        continue;
      }

      const parsed = await this.parser.parseJobEmail(email);
      if (!parsed.isJobEmail || parsed.confidence < 0.8) continue;

      const company = (parsed.company || '').trim();
      const jobTitle = (parsed.jobTitle || '').trim();
      if (!company && !jobTitle) continue;

      result.jobsDetected++;
      result.detections.push({
        company: company || 'Unknown',
        jobTitle: jobTitle || 'Unknown',
        status: parsed.status || 'applied',
        subject: email.subject,
      });

      const updated = await this.updateApplicationStatus(candidateId, {
        company,
        jobTitle,
        status: parsed.status,
        nextSteps: parsed.nextSteps,
        interviewDate: parsed.interviewDate,
      });
      if (updated) result.autoUpdates++;
    }

    return result;
  }

  /**
   * Find or create job by company + title; find or create application for candidate; update status/notes/interview_date.
   */
  async updateApplicationStatus(
    candidateId: string,
    emailData: { company: string; jobTitle: string; status?: string; nextSteps?: string; interviewDate?: string }
  ): Promise<boolean> {
    const status = toApplicationStatus(emailData.status || 'applied');
    const job = await this.findOrCreateJob(emailData.company, emailData.jobTitle);
    if (!job) return false;

    const { data: existing } = await this.supabase
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('job_id', job.id)
      .maybeSingle();

    const notes = emailData.nextSteps ? `Auto-detected from email: ${emailData.nextSteps}` : undefined;
    const interviewDate = emailData.interviewDate ? new Date(emailData.interviewDate).toISOString() : null;

    if (existing) {
      const { error } = await this.supabase
        .from('applications')
        .update({
          status,
          notes: notes ?? undefined,
          interview_date: interviewDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      return !error;
    }

    const { error } = await this.supabase.from('applications').insert({
      candidate_id: candidateId,
      job_id: job.id,
      status,
      notes: notes ?? undefined,
      interview_date: interviewDate,
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return !error;
  }

  private async findOrCreateJob(company: string, title: string): Promise<{ id: string } | null> {
    const normCompany = (company || '').trim().slice(0, 500);
    const normTitle = (title || '').trim().slice(0, 500);
    if (!normCompany && !normTitle) return null;

    const dedupeHash = createHash('sha256')
      .update(`gmail_auto_track:${normCompany}:${normTitle}`)
      .digest('hex');

    const { data: existing } = await this.supabase
      .from('jobs')
      .select('id')
      .eq('source', 'gmail_auto_track')
      .eq('dedupe_hash', dedupeHash)
      .eq('is_active', true)
      .maybeSingle();

    if (existing) return existing;

    const { data: inserted } = await this.supabase
      .from('jobs')
      .insert({
        source: 'gmail_auto_track',
        title: normTitle || 'Job',
        company: normCompany || 'Unknown',
        dedupe_hash: dedupeHash,
        is_active: true,
        scraped_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    return inserted;
  }
}
