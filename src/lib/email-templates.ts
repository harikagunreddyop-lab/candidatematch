/**
 * Default email templates and variable substitution.
 * Used for application confirmation, interview invite, rejection, etc.
 */

export interface EmailTemplateDef {
  name: string;
  template_type: string;
  subject: string;
  body: string;
  variables: string[];
}

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    name: 'Application Received',
    template_type: 'application_confirmation',
    subject: 'Thank you for applying to {job_title}',
    body: `<p>Hi {candidate_name},</p>
<p>Thank you for applying to the <strong>{job_title}</strong> position at {company_name}.</p>
<p>We've received your application and our team will review it shortly. You can expect to hear back from us within {response_time_days} business days.</p>
<p>In the meantime, you can check your application status at: {application_url}</p>
<p>Best regards,<br>{recruiter_name}<br>{company_name}</p>`,
    variables: ['candidate_name', 'job_title', 'company_name', 'response_time_days', 'application_url', 'recruiter_name'],
  },
  {
    name: 'Interview Invitation',
    template_type: 'interview_invite',
    subject: 'Interview invitation for {job_title}',
    body: `<p>Hi {candidate_name},</p>
<p>Great news! We'd like to invite you for an interview for the <strong>{job_title}</strong> position.</p>
<p><strong>Interview details:</strong></p>
<ul>
  <li>Date: {interview_date}</li>
  <li>Time: {interview_time}</li>
  <li>Duration: {interview_duration}</li>
  <li>Format: {interview_format}</li>
  {interview_location_line}
  {meeting_link_line}
</ul>
<p>You'll be meeting with {interviewer_names}.</p>
<p>Please confirm your attendance by replying to this email or using the link: {confirmation_url}</p>
<p>Best regards,<br>{recruiter_name}<br>{company_name}</p>`,
    variables: [
      'candidate_name',
      'job_title',
      'interview_date',
      'interview_time',
      'interview_duration',
      'interview_format',
      'interview_location_line',
      'meeting_link_line',
      'interviewer_names',
      'confirmation_url',
      'recruiter_name',
      'company_name',
    ],
  },
  {
    name: 'Rejection (Kind)',
    template_type: 'rejection',
    subject: 'Update on your application for {job_title}',
    body: `<p>Hi {candidate_name},</p>
<p>Thank you for taking the time to apply for the <strong>{job_title}</strong> position and for speaking with our team.</p>
<p>After careful consideration, we've decided to move forward with other candidates whose experience more closely aligns with our current needs.</p>
<p>We were impressed by {positive_feedback}, and we encourage you to apply for future openings that match your skills and experience.</p>
<p>We wish you the best in your job search.</p>
<p>Best regards,<br>{recruiter_name}<br>{company_name}</p>`,
    variables: ['candidate_name', 'job_title', 'positive_feedback', 'recruiter_name', 'company_name'],
  },
  {
    name: 'Offer Letter',
    template_type: 'offer',
    subject: 'Offer of employment – {job_title} at {company_name}',
    body: `<p>Hi {candidate_name},</p>
<p>We are pleased to extend an offer of employment for the position of <strong>{job_title}</strong> at {company_name}.</p>
<p><strong>Details:</strong></p>
<ul>
  <li>Start date: {start_date}</li>
  <li>Compensation: {compensation}</li>
  {benefits_line}
</ul>
<p>Please review the attached offer letter and let us know by {response_deadline}. You can accept by replying to this email or using: {acceptance_url}</p>
<p>We look forward to having you on the team.</p>
<p>Best regards,<br>{recruiter_name}<br>{company_name}</p>`,
    variables: ['candidate_name', 'job_title', 'company_name', 'start_date', 'compensation', 'benefits_line', 'response_deadline', 'acceptance_url', 'recruiter_name'],
  },
  {
    name: 'Application Follow-up',
    template_type: 'follow_up',
    subject: 'Quick update on your application for {job_title}',
    body: `<p>Hi {candidate_name},</p>
<p>We wanted to give you a quick update on your application for <strong>{job_title}</strong> at {company_name}.</p>
<p>{custom_message}</p>
<p>If you have any questions, just reply to this email.</p>
<p>Best regards,<br>{recruiter_name}</p>`,
    variables: ['candidate_name', 'job_title', 'company_name', 'custom_message', 'recruiter_name'],
  },
];

/**
 * Replace {variable} placeholders in subject and body.
 */
export function renderTemplate(
  subjectTemplate: string,
  bodyTemplate: string,
  data: Record<string, string>
): { subject: string; body: string } {
  let subject = subjectTemplate;
  let body = bodyTemplate;
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{${key}}`;
    subject = subject.split(placeholder).join(value ?? '');
    body = body.split(placeholder).join(value ?? '');
    seen.add(key);
  }
  // Replace any remaining {var} with empty string
  subject = subject.replace(/\{[^}]+\}/g, '');
  body = body.replace(/\{[^}]+\}/g, '');
  return { subject, body };
}

/**
 * Extract variable names from template text (e.g. {candidate_name} -> candidate_name).
 */
export function extractVariables(text: string): string[] {
  const set = new Set<string>();
  const re = /\{([a-z_][a-z0-9_]*)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) set.add(m[1]);
  return Array.from(set);
}
