'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Filter, X } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface JobSearchParams {
  query?: string;
  location?: string;
  remote_type?: string;
  salary_min?: number;
  salary_max?: number;
  job_type?: string[];
  experience_level?: string[];
  skills?: string[];
  posted_after?: string;
  posted_days?: string; // UI: '1','7','30' for select
  sort_by?: string;
  // Optional filters (API/DB may support later)
  company_size?: string[];
  industry?: string[];
  visa_sponsorship?: boolean;
  benefits?: string[];
  application_deadline_before?: string;
}

export interface FilterPanelProps {
  params: JobSearchParams;
  onChange: (params: JobSearchParams) => void;
  className?: string;
}

const REMOTE_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
];

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'];
const EXPERIENCE_LEVELS = ['Intern', 'Entry', 'Mid', 'Senior', 'Lead', 'Executive'];
const POSTED_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Past 24 hours' },
  { value: '7', label: 'Past week' },
  { value: '30', label: 'Past month' },
];
const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'match_score', label: 'Match score' },
  { value: 'date', label: 'Date posted' },
  { value: 'salary', label: 'Salary' },
];

export function FilterPanel({ params, onChange, className }: FilterPanelProps) {
  const [open, setOpen] = useState(false);

  const update = (key: keyof JobSearchParams, value: unknown) => {
    onChange({ ...params, [key]: value });
  };

  const clearAll = () => {
    onChange({
      query: params.query,
      location: params.location,
    });
  };

  const hasFilters = !!(
    params.remote_type ||
    (params.salary_min != null && params.salary_min > 0) ||
    (params.salary_max != null && params.salary_max > 0) ||
    (params.job_type?.length ?? 0) > 0 ||
    (params.experience_level?.length ?? 0) > 0 ||
    (params.skills?.length ?? 0) > 0 ||
    params.posted_days ||
    (params.sort_by && params.sort_by !== 'relevance')
  );
  return (
    <div className={cn('rounded-xl border border-surface-700 bg-surface-800/50 overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-surface-200 hover:bg-surface-700/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-inset rounded-b-xl md:rounded-none"
        aria-expanded={open}
        aria-controls="filter-panel-content"
        id="filter-panel-toggle"
      >
        <span className="flex items-center gap-2">
          <Filter size={16} />
          Filters & sort
          {hasFilters && (
            <span className="text-xs bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded">On</span>
          )}
        </span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && (
        <div id="filter-panel-content" role="region" aria-labelledby="filter-panel-toggle" className="px-4 pb-4 pt-1 border-t border-surface-700 space-y-4 max-h-[70vh] overflow-y-auto md:max-h-none md:overflow-visible">
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-surface-400 hover:text-surface-200 flex items-center gap-1"
            >
              <X size={12} /> Clear filters
            </button>
          )}

          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Work type</label>
            <select
              value={params.remote_type || ''}
              onChange={(e) => update('remote_type', e.target.value || undefined)}
              className="input text-sm py-1.5 w-full bg-surface-900 border-surface-700 text-surface-100"
            >
              {REMOTE_OPTIONS.map((o) => (
                <option key={o.value || 'any'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1">Min salary</label>
              <input
                type="number"
                min={0}
                value={params.salary_min ?? ''}
                onChange={(e) => update('salary_min', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder="e.g. 80000"
                className="input text-sm py-1.5 w-full bg-surface-900 border-surface-700 text-surface-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1">Max salary</label>
              <input
                type="number"
                min={0}
                value={params.salary_max ?? ''}
                onChange={(e) => update('salary_max', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder="e.g. 150000"
                className="input text-sm py-1.5 w-full bg-surface-900 border-surface-700 text-surface-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Job type</label>
            <div className="flex flex-wrap gap-1.5">
              {JOB_TYPES.map((t) => {
                const selected = params.job_type?.includes(t) ?? false;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? (params.job_type ?? []).filter((x) => x !== t)
                        : [...(params.job_type ?? []), t];
                      update('job_type', next.length ? next : undefined);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                      selected
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Experience</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPERIENCE_LEVELS.map((l) => {
                const selected = params.experience_level?.includes(l) ?? false;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? (params.experience_level ?? []).filter((x) => x !== l)
                        : [...(params.experience_level ?? []), l];
                      update('experience_level', next.length ? next : undefined);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                      selected
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                    )}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Skills (comma-separated)</label>
            <input
              type="text"
              value={params.skills?.join(', ') ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const next = raw
                  .split(/[,;]/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                update('skills', next.length ? next : undefined);
              }}
              placeholder="e.g. React, TypeScript, Node"
              className="input text-sm py-1.5 w-full bg-surface-900 border-surface-700 text-surface-100"
            />
          </div>

          <div>
            <select
              value={params.posted_days || ''}
              onChange={(e) => {
                const v = e.target.value;
                const next: Partial<JobSearchParams> = { posted_days: v || undefined };
                if (v) {
                  const d = new Date();
                  d.setDate(d.getDate() - parseInt(v, 10));
                  next.posted_after = d.toISOString();
                } else next.posted_after = undefined;
                onChange({ ...params, ...next });
              }}
              className="input text-sm py-1.5 w-full bg-surface-900 border-surface-700 text-surface-100"
            >
              {POSTED_OPTIONS.map((o) => (
                <option key={o.value || 'any'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Sort by</label>
            <select
              value={params.sort_by || 'relevance'}
              onChange={(e) => update('sort_by', e.target.value)}
              className="input text-sm py-1.5 w-full bg-surface-900 border-surface-700 text-surface-100"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
