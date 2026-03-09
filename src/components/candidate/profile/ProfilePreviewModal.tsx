'use client';

import { X, Mail, Briefcase, GraduationCap, FileText } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { Candidate } from '@/types';
import type { Experience, Education } from '@/types';

export interface ProfilePreviewModalProps {
  open: boolean;
  onClose: () => void;
  candidate: Candidate | null;
  privacySettings?: { show_email?: boolean; show_phone?: boolean; show_salary?: boolean };
}

const defaultPrivacy = { show_email: true, show_phone: true, show_salary: true };

export function ProfilePreviewModal({
  open,
  onClose,
  candidate,
  privacySettings = defaultPrivacy,
}: ProfilePreviewModalProps) {
  const privacy = { ...defaultPrivacy, ...privacySettings };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Profile preview (company view)"
    >
      <div
        className={cn(
          'bg-surface-100 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-2xl shadow-xl',
          'w-full max-w-2xl max-h-[90vh] overflow-y-auto'
        )}
      >
        <div className="sticky top-0 bg-surface-100 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">
            Profile preview (as recruiters see it)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          {!candidate ? (
            <p className="text-surface-500">No profile data.</p>
          ) : (
            <>
              <div>
                <h3 className="text-lg font-semibold text-surface-900 dark:text-white">
                  {candidate.full_name || 'Name'}
                </h3>
                <p className="text-surface-600 dark:text-surface-300">{candidate.primary_title}</p>
              </div>

              {candidate.summary && (
                <section>
                  <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-200 flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" /> Summary
                  </h4>
                  <p className="text-sm text-surface-600 dark:text-surface-300 whitespace-pre-wrap">
                    {candidate.summary}
                  </p>
                </section>
              )}

              <section>
                <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-200 flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4" /> Contact
                </h4>
                <ul className="text-sm text-surface-600 dark:text-surface-300 space-y-1">
                  {privacy.show_email && candidate.email && <li>{candidate.email}</li>}
                  {privacy.show_phone && candidate.phone && <li>{candidate.phone}</li>}
                  {candidate.location && <li>{candidate.location}</li>}
                  {candidate.linkedin_url && (
                    <li>
                      <a href={candidate.linkedin_url} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">
                        LinkedIn
                      </a>
                    </li>
                  )}
                </ul>
              </section>

              {(candidate.experience?.length ?? 0) > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-200 flex items-center gap-2 mb-2">
                    <Briefcase className="w-4 h-4" /> Experience
                  </h4>
                  <ul className="space-y-3">
                    {(candidate.experience ?? []).map((exp: Experience, i: number) => (
                      <li key={i} className="border-l-2 border-brand-300 dark:border-brand-500/50 pl-3">
                        <p className="font-medium text-surface-800 dark:text-surface-100">{exp.title}</p>
                        <p className="text-sm text-surface-500 dark:text-surface-400">{exp.company}</p>
                        <p className="text-xs text-surface-400 dark:text-surface-500">
                          {exp.start_date} — {exp.current ? 'Present' : exp.end_date}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(candidate.education?.length ?? 0) > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-200 flex items-center gap-2 mb-2">
                    <GraduationCap className="w-4 h-4" /> Education
                  </h4>
                  <ul className="space-y-2">
                    {(candidate.education ?? []).map((ed: Education, i: number) => (
                      <li key={i}>
                        <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                          {ed.degree} in {ed.field}
                        </p>
                        <p className="text-xs text-surface-500 dark:text-surface-400">
                          {ed.institution} · {ed.graduation_date}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(candidate.skills?.length ?? 0) > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-2">Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {(candidate.skills ?? []).map((s: string, i: number) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-brand-100 dark:bg-brand-500/20 text-brand-800 dark:text-brand-200 text-xs font-medium"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {(privacy.show_salary && (candidate.salary_min != null || candidate.salary_max != null)) && (
                <section>
                  <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-1">Salary range</h4>
                  <p className="text-sm text-surface-600 dark:text-surface-300">
                    {candidate.salary_min != null && `$${candidate.salary_min.toLocaleString()}`}
                    {candidate.salary_min != null && candidate.salary_max != null && ' – '}
                    {candidate.salary_max != null && `$${candidate.salary_max.toLocaleString()}`}
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
