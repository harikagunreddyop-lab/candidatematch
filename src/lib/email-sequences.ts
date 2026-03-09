/**
 * Trigger an email sequence for an application (e.g. on application_received).
 * Schedules steps according to sequence definition; cron processes scheduled_emails.
 */

import { createServiceClient } from '@/lib/supabase-server';
import { renderTemplate } from '@/lib/email-templates';
import { getAppUrl } from '@/config';

export type SequenceTrigger = 'application_received' | 'interview_scheduled' | 'offer_sent';

export interface SequenceStep {
  delay_hours: number;
  template_id: string;
  conditions?: { field: string; operator: 'equals' | 'not_equals' | 'contains'; value: string }[];
}

export async function triggerEmailSequence(
  companyId: string,
  triggerEvent: SequenceTrigger,
  applicationId: string,
  emailAccountId: string
): Promise<{ scheduled: number; skipped: number }> {
  const supabase = createServiceClient();
  const { data: sequence } = await supabase
    .from('email_sequences')
    .select('id, steps')
    .eq('company_id', companyId)
    .eq('trigger_event', triggerEvent)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!sequence || !Array.isArray(sequence.steps) || sequence.steps.length === 0) {
    return { scheduled: 0, skipped: 0 };
  }

  const { data: app } = await supabase
    .from('applications')
    .select('id, status, candidate_id, job_id')
    .eq('id', applicationId)
    .single();

  if (!app) return { scheduled: 0, skipped: 0 };

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, full_name, email')
    .eq('id', app.candidate_id)
    .single();

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, company_id')
    .eq('id', app.job_id)
    .single();

  const appUrl = getAppUrl() || '';
  const applicationUrl = appUrl ? `${appUrl}/dashboard/candidate/applications` : '';
  const baseData: Record<string, string> = {
    candidate_name: candidate?.full_name ?? 'Candidate',
    job_title: job?.title ?? 'the position',
    company_name: 'Our company',
    application_url: applicationUrl,
    response_time_days: '5',
    recruiter_name: 'The team',
  };

  let scheduled = 0;
  let skipped = 0;
  const steps = sequence.steps as SequenceStep[];

  for (const step of steps) {
    if (step.conditions?.length) {
      const appRecord = app as Record<string, unknown>;
      const met = step.conditions.every((c) => {
        const val = String(appRecord[c.field] ?? '');
        if (c.operator === 'equals') return val === c.value;
        if (c.operator === 'not_equals') return val !== c.value;
        if (c.operator === 'contains') return val.includes(c.value);
        return false;
      });
      if (!met) {
        skipped++;
        continue;
      }
    }

    const sendAt = new Date(Date.now() + (step.delay_hours || 0) * 60 * 60 * 1000);
    const templateId = step.template_id;
    let subject = 'Follow-up';
    let bodyHtml = '<p>Hello {candidate_name},</p><p>Update on your application.</p>';

    if (templateId.startsWith('default-')) {
      const { DEFAULT_EMAIL_TEMPLATES } = await import('@/lib/email-templates');
      const def = DEFAULT_EMAIL_TEMPLATES.find((t) => `default-${t.template_type}` === templateId);
      if (def) {
        const rendered = renderTemplate(def.subject, def.body, baseData);
        subject = rendered.subject;
        bodyHtml = rendered.body;
      }
    } else {
      const { data: template } = await supabase
        .from('email_templates')
        .select('subject_template, body_template')
        .eq('id', templateId)
        .single();
      if (template) {
        const rendered = renderTemplate(template.subject_template, template.body_template, baseData);
        subject = rendered.subject;
        bodyHtml = rendered.body;
      }
    }

    const toEmail = candidate?.email ? [candidate.email] : [];
    if (toEmail.length === 0) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from('scheduled_emails').insert({
      company_id: companyId,
      email_account_id: emailAccountId,
      template_id: templateId.startsWith('default-') ? null : templateId,
      sequence_id: sequence.id,
      sequence_step: steps.indexOf(step),
      to_email: toEmail,
      subject,
      body_html: bodyHtml,
      related_candidate_id: app.candidate_id,
      related_application_id: applicationId,
      tracking_enabled: true,
      send_at: sendAt.toISOString(),
      status: 'pending',
    });

    if (!error) scheduled++;
  }

  return { scheduled, skipped };
}
