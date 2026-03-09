'use client';

import Link from 'next/link';
import { cn } from '@/utils/helpers';

export interface CandidateComparisonRow {
  field: string;
  label: string;
  type: 'text' | 'number' | 'array' | 'score';
}

export interface CandidateForComparison {
  id: string;
  full_name?: string;
  primary_title?: string;
  years_of_experience?: number;
  skills?: string[];
  location?: string;
  summary?: string;
  ai_score?: number;
  expected_salary?: number;
  availability?: string;
  [key: string]: unknown;
}

export interface CandidateComparisonTableProps {
  candidates: CandidateForComparison[];
  jobId?: string;
  fields?: CandidateComparisonRow[];
  className?: string;
}

const DEFAULT_FIELDS: CandidateComparisonRow[] = [
  { field: 'full_name', label: 'Name', type: 'text' },
  { field: 'years_of_experience', label: 'Experience (years)', type: 'number' },
  { field: 'skills', label: 'Skills', type: 'array' },
  { field: 'primary_title', label: 'Current role', type: 'text' },
  { field: 'location', label: 'Location', type: 'text' },
  { field: 'ai_score', label: 'AI match score', type: 'score' },
  { field: 'expected_salary', label: 'Salary expectations', type: 'number' },
  { field: 'availability', label: 'Availability', type: 'text' },
];

function getValue(c: CandidateForComparison, field: string): unknown {
  const v = c[field];
  if (field === 'skills' && Array.isArray(v)) return v;
  return v ?? '—';
}

function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return '—';
  if (type === 'array' && Array.isArray(value)) return value.slice(0, 8).join(', ') + (value.length > 8 ? '…' : '');
  if (type === 'number' || type === 'score') return String(value);
  return String(value);
}

function isBestInRow(candidates: CandidateForComparison[], field: string, type: string, value: unknown): boolean {
  if (type !== 'number' && type !== 'score') return false;
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return false;
  const values = candidates.map((c) => {
    const v = getValue(c, field);
    return typeof v === 'number' ? v : Number(v);
  }).filter((n) => !Number.isNaN(n));
  if (values.length === 0) return false;
  const max = Math.max(...values);
  return num === max && max > 0;
}

export function CandidateComparisonTable({
  candidates,
  jobId: _jobId,
  fields = DEFAULT_FIELDS,
  className,
}: CandidateComparisonTableProps) {
  if (candidates.length === 0) {
    return (
      <div className={cn('rounded-xl border border-surface-200 dark:border-surface-600 p-6 text-center text-surface-500', className)}>
        Add at least 2 candidates to compare.
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-600', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-100 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-600">
            <th className="text-left py-3 px-4 font-semibold text-surface-700 dark:text-surface-200 w-40">
              Criteria
            </th>
            {candidates.map((c) => (
              <th key={c.id} className="text-left py-3 px-4 font-semibold text-surface-700 dark:text-surface-200 min-w-[140px]">
                <Link
                  href={`/dashboard/company/candidates/${c.id}`}
                  className="text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {c.full_name ?? 'Candidate'}
                </Link>
                {c.primary_title && (
                  <p className="text-xs font-normal text-surface-500 dark:text-surface-400 mt-0.5">
                    {c.primary_title}
                  </p>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((row) => (
            <tr
              key={row.field}
              className="border-b border-surface-100 dark:border-surface-700/50 last:border-0"
            >
              <td className="py-2 px-4 font-medium text-surface-600 dark:text-surface-400">
                {row.label}
              </td>
              {candidates.map((c) => {
                const value = getValue(c, row.field);
                const str = formatValue(value, row.type);
                const best = isBestInRow(candidates, row.field, row.type, value);
                return (
                  <td
                    key={c.id}
                    className={cn(
                      'py-2 px-4 text-surface-800 dark:text-surface-200',
                      best && 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold text-emerald-700 dark:text-emerald-300'
                    )}
                  >
                    {str}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
