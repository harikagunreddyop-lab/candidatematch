'use client';

import { X, Minus, Star, ExternalLink } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { JobCardJob } from './JobCard';

export interface JobComparisonTableProps {
  jobs: JobCardJob[];
  onClose: () => void;
  onRemove?: (jobId: string) => void;
  className?: string;
}

function formatSalary(min: number | null | undefined, max: number | null | undefined): string {
  if (min != null && max != null) return `$${(min / 1000).toFixed(0)}k – $${(max / 1000).toFixed(0)}k`;
  if (min != null) return `$${(min / 1000).toFixed(0)}k+`;
  if (max != null) return `Up to $${(max / 1000).toFixed(0)}k`;
  return '—';
}

export function JobComparisonTable({ jobs, onClose, onRemove, className }: JobComparisonTableProps) {
  if (jobs.length === 0) return null;

  const rows: { label: string; key: string; format: (j: JobCardJob) => React.ReactNode }[] = [
    { label: 'Job title', key: 'title', format: (j) => <span className="font-medium">{j.title || '—'}</span> },
    { label: 'Company', key: 'company', format: (j) => j.company || '—' },
    { label: 'Location', key: 'location', format: (j) => j.location || (j.remote_type ? j.remote_type : '—') },
    { label: 'Remote', key: 'remote_type', format: (j) => j.remote_type ? <span className="capitalize">{j.remote_type}</span> : '—' },
    { label: 'Salary', key: 'salary', format: (j) => formatSalary(j.salary_min, j.salary_max) },
    { label: 'Job type', key: 'job_type', format: (j) => j.job_type || '—' },
    {
      label: 'Referral',
      key: 'referral',
      format: (j) =>
        j.referral_available ? (
          <span className="inline-flex items-center gap-1 text-brand-400 text-xs font-medium">Referral available</span>
        ) : (
          '—'
        ),
    },
    {
      label: 'Match score',
      key: 'match_score',
      format: (j) =>
        j.match_score != null ? (
          <span
            className={cn(
              'font-semibold',
              j.match_score >= 80 ? 'text-emerald-400' : j.match_score >= 60 ? 'text-amber-400' : 'text-surface-400'
            )}
          >
            {j.match_score}%
          </span>
        ) : (
          '—'
        ),
    },
    {
      label: 'Application fit',
      key: 'application_fit',
      format: (j) =>
        j.match_score != null ? (
          <span className="text-xs text-surface-400">
            {j.match_score >= 80 ? 'Strong fit' : j.match_score >= 60 ? 'Good fit' : 'Consider improving profile'}
          </span>
        ) : (
          '—'
        ),
    },
    {
      label: 'Top match reasons',
      key: 'reasons',
      format: (j) =>
        j.match_reasons?.length ? (
          <ul className="text-xs space-y-0.5">
            {j.match_reasons.slice(0, 3).map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        ) : (
          '—'
        ),
    },
    {
      label: 'Required skills',
      key: 'skills',
      format: (j) =>
        (j.must_have_skills?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-1">
            {(j.must_have_skills ?? []).slice(0, 5).map((s, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-surface-700 text-surface-300 text-xs">
                {s}
              </span>
            ))}
            {(j.must_have_skills?.length ?? 0) > 5 && (
              <span className="text-xs text-surface-500">+{(j.must_have_skills?.length ?? 0) - 5}</span>
            )}
          </div>
        ) : (
          '—'
        ),
    },
    {
      label: 'Company reviews',
      key: 'reviews',
      format: (j) =>
        j.company ? (
          <a
            href={`https://www.glassdoor.com/Reviews/index.htm?keyword=${encodeURIComponent(j.company.trim())}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 text-xs"
          >
            <Star size={12} />
            Glassdoor
            <ExternalLink size={10} />
          </a>
        ) : (
          '—'
        ),
    },
    {
      label: 'Directions',
      key: 'directions',
      format: (j) =>
        j.location?.trim() ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(j.location.trim())}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 text-xs"
          >
            Google Maps
            <ExternalLink size={10} />
          </a>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className={cn('rounded-xl border border-surface-700 bg-surface-800/80 overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
        <h2 className="text-lg font-semibold text-surface-100">Compare jobs</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-100"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-surface-700">
              <th className="text-left py-3 px-4 text-surface-400 font-medium w-36">Attribute</th>
              {jobs.map((job) => (
                <th key={job.id} className="text-left py-3 px-4 font-medium text-surface-200 align-top max-w-[200px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate">{job.title || 'Untitled'}</span>
                    {onRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(job.id)}
                        className="p-1 rounded hover:bg-surface-700 text-surface-500 shrink-0"
                        title="Remove from comparison"
                      >
                        <Minus size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5">{job.company}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-surface-700/70">
                <td className="py-2.5 px-4 text-surface-400 align-top">{row.label}</td>
                {jobs.map((job) => (
                  <td key={job.id} className="py-2.5 px-4 text-surface-200 align-top max-w-[200px]">
                    {row.format(job)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
