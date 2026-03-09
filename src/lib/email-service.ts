/**
 * Transactional email via Resend.
 * sendEmail({ to, subject, html }) — optional from, replyTo.
 * Template helpers: welcome, applicationReceived, companyInvite, interviewScheduled.
 * When RESEND_API_KEY is not set, no-op (returns { id: null }).
 */

import { Resend } from 'resend';
import { getAppUrl } from '@/config';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'CandidateMatch <onboarding@resend.dev>';
const APP_URL = getAppUrl();

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

/** Send a single email. Returns { id } or { id: null, error } when Resend is not configured. */
export async function sendEmail(params: SendEmailParams): Promise<{ id: string | null; error?: string }> {
  if (!resend) return { id: null };
  const to = Array.isArray(params.to) ? params.to : [params.to];
  try {
    const { data, error } = await resend.emails.send({
      from: params.from ?? FROM_EMAIL,
      to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { id: null, error: message };
  }
}

export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY;
}

// ── Template helpers (HTML with APP_URL) ─────────────────────────────────────

function baseHtml(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #333; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 1.25rem; margin-bottom: 16px;">${escapeHtml(title)}</h1>
  ${body}
  <p style="margin-top: 24px; font-size: 0.875rem; color: #666;">
    <a href="${APP_URL}" style="color: #2563eb;">CandidateMatch</a>
  </p>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Welcome email after signup. */
export function templateWelcome(options: { name?: string; loginUrl?: string }): { subject: string; html: string } {
  const name = options.name || 'there';
  const loginUrl = options.loginUrl || `${APP_URL}/auth/callback`;
  const subject = 'Welcome to CandidateMatch';
  const html = baseHtml(
    'Welcome to CandidateMatch',
    `
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your account is ready. Sign in to get started:</p>
  <p><a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Sign in</a></p>
`
  );
  return { subject, html };
}

/** Application submitted confirmation (to candidate). */
export function templateApplicationReceived(options: {
  candidateName?: string;
  jobTitle: string;
  companyName?: string;
  dashboardUrl?: string;
}): { subject: string; html: string } {
  const name = options.candidateName || 'there';
  const dashboardUrl = options.dashboardUrl || `${APP_URL}/dashboard/candidate/applications`;
  const subject = `Application received — ${options.jobTitle}`;
  const html = baseHtml(
    'Application received',
    `
  <p>Hi ${escapeHtml(name)},</p>
  <p>We've received your application for <strong>${escapeHtml(options.jobTitle)}</strong>${options.companyName ? ` at ${escapeHtml(options.companyName)}` : ''}.</p>
  <p><a href="${dashboardUrl}" style="color: #2563eb;">View your applications</a></p>
`
  );
  return { subject, html };
}

/** Company invite (invitee to join company). */
export function templateCompanyInvite(options: {
  inviterName?: string;
  companyName: string;
  inviteLink: string;
  role?: string;
}): { subject: string; html: string } {
  const inviter = options.inviterName || 'A team member';
  const subject = `You're invited to join ${options.companyName}`;
  const html = baseHtml(
    `Invitation to join ${escapeHtml(options.companyName)}`,
    `
  <p>Hi,</p>
  <p>${escapeHtml(inviter)} has invited you to join <strong>${escapeHtml(options.companyName)}</strong>${options.role ? ` as ${escapeHtml(options.role)}` : ''}.</p>
  <p><a href="${options.inviteLink}" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Accept invitation</a></p>
  <p style="font-size: 0.875rem; color: #666;">This link expires in 7 days.</p>
`
  );
  return { subject, html };
}

/** Interview scheduled (to candidate). */
export function templateInterviewScheduled(options: {
  candidateName?: string;
  jobTitle: string;
  companyName?: string;
  dateTime?: string;
  detailsUrl?: string;
}): { subject: string; html: string } {
  const name = options.candidateName || 'there';
  const subject = `Interview scheduled — ${options.jobTitle}`;
  const html = baseHtml(
    'Interview scheduled',
    `
  <p>Hi ${escapeHtml(name)},</p>
  <p>An interview has been scheduled for <strong>${escapeHtml(options.jobTitle)}</strong>${options.companyName ? ` at ${escapeHtml(options.companyName)}` : ''}.</p>
  ${options.dateTime ? `<p><strong>When:</strong> ${escapeHtml(options.dateTime)}</p>` : ''}
  ${options.detailsUrl ? `<p><a href="${options.detailsUrl}" style="color: #2563eb;">View details</a></p>` : ''}
`
  );
  return { subject, html };
}

/** Saved search alert: new jobs matching the candidate's saved search. */
export function templateSavedSearchAlert(options: {
  candidateName?: string;
  searchName: string;
  jobs: { title: string; company?: string; location?: string; url?: string }[];
  jobsUrl: string;
}): { subject: string; html: string } {
  const name = options.candidateName || 'there';
  const count = options.jobs.length;
  const subject = `New jobs for "${options.searchName}" — ${count} match${count !== 1 ? 'es' : ''}`;
  const listItems = options.jobs
    .slice(0, 15)
    .map(
      (j) =>
        `<li style="margin-bottom: 8px;"><a href="${j.url ? escapeHtml(j.url) : '#'}" style="color: #2563eb;">${escapeHtml(j.title)}</a>${j.company ? ` at ${escapeHtml(j.company)}` : ''}${j.location ? ` — ${escapeHtml(j.location)}` : ''}</li>`
    )
    .join('');
  const html = baseHtml(
    `New jobs for ${escapeHtml(options.searchName)}`,
    `
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your saved search <strong>${escapeHtml(options.searchName)}</strong> has ${count} new job${count !== 1 ? 's' : ''}.</p>
  <ul style="list-style: none; padding-left: 0;">${listItems}</ul>
  <p><a href="${escapeHtml(options.jobsUrl)}" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">View all jobs</a></p>
`
  );
  return { subject, html };
}
