'use client';

import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { renderTemplate } from '@/lib/email-templates';
import { Spinner } from '@/components/ui';

export interface EmailTemplateLibraryProps {
  onSelectTemplate?: (subject: string, body: string, variables: string[]) => void;
  className?: string;
}

export function EmailTemplateLibrary({ onSelectTemplate, className = '' }: EmailTemplateLibraryProps) {
  const [templates, setTemplates] = useState<Array<{
    id: string;
    template_name: string;
    template_type?: string;
    subject_template: string;
    body_template: string;
    variables: string[];
    is_default?: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);

  useEffect(() => {
    fetch('/api/emails/templates', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setTemplates(data.templates ?? []);
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  const handlePreview = (t: { subject_template: string; body_template: string }) => {
    const sample: Record<string, string> = {
      candidate_name: 'Jane Doe',
      job_title: 'Senior Engineer',
      company_name: 'Acme Inc',
      response_time_days: '5',
      application_url: 'https://app.example.com/dashboard/applications',
      recruiter_name: 'Recruiting Team',
      interview_date: '2025-03-15',
      interview_time: '2:00 PM',
      interview_duration: '45 min',
      interview_format: 'Video',
      interview_location_line: '<li>Location: Remote</li>',
      meeting_link_line: '<li>Join: <a href="#">Meeting Link</a></li>',
      interviewer_names: 'Sarah Smith',
      confirmation_url: 'https://app.example.com/confirm',
      positive_feedback: 'your background and communication skills',
      custom_message: 'We are still reviewing applications and will update you soon.',
      start_date: 'April 1, 2025',
      compensation: '$120,000 base',
      benefits_line: '<li>Benefits: Health, 401k</li>',
      response_deadline: 'March 22, 2025',
      acceptance_url: 'https://app.example.com/accept',
    };
    setPreview(renderTemplate(t.subject_template, t.body_template, sample));
  };

  if (loading) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center py-8">
          <Spinner size={24} />
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <FileText size={16} /> Templates
        </h3>
      </div>
      <ul className="space-y-2">
        {templates.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-2 p-3 rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 hover:bg-surface-100 dark:hover:bg-surface-700/50"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-surface-900 dark:text-surface-100 truncate">{t.template_name}</p>
              <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{t.subject_template}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handlePreview(t)}
                className="text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 px-2 py-1"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => onSelectTemplate?.(t.subject_template, t.body_template, t.variables ?? [])}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline px-2 py-1"
              >
                Use
              </button>
            </div>
          </li>
        ))}
      </ul>
      {preview && (
        <div className="mt-4 p-4 rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50">
          <p className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Subject</p>
          <p className="text-sm text-surface-800 dark:text-surface-200 mb-3">{preview.subject}</p>
          <p className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Body</p>
          <div
            className="text-sm text-surface-700 dark:text-surface-300 prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: preview.body }}
          />
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="mt-3 text-xs text-surface-500 hover:text-surface-700"
          >
            Close preview
          </button>
        </div>
      )}
    </div>
  );
}
