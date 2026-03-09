'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
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
  const [activeMenu, setActiveMenu] = useState<null | 'salary' | 'job_type' | 'experience' | 'more'>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setActiveMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const pillClass = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
      active
        ? 'border-brand-400 bg-brand-500/15 text-brand-700'
        : 'border-surface-300 bg-surface-100 text-surface-700 hover:bg-surface-200'
    );

  return (
    <div ref={rootRef} className={cn('rounded-lg border border-surface-300 bg-surface-50 p-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-surface-700 px-1">
          <Filter size={14} /> Filters
        </span>

        <select
          value={params.remote_type || ''}
          onChange={(e) => update('remote_type', e.target.value || undefined)}
          className="input h-8 rounded-full border-surface-300 bg-surface-100 px-3 py-0 text-xs font-semibold text-surface-800 w-[120px]"
        >
          {REMOTE_OPTIONS.map((o) => (
            <option key={o.value || 'any'} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveMenu(activeMenu === 'salary' ? null : 'salary')}
            className={pillClass((params.salary_min != null && params.salary_min > 0) || (params.salary_max != null && params.salary_max > 0))}
          >
            Salary <ChevronDown size={13} />
          </button>
          {activeMenu === 'salary' && (
            <div className="absolute left-0 top-10 z-30 w-64 rounded-xl border border-surface-300 bg-surface-50 p-3 shadow-modal">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  value={params.salary_min ?? ''}
                  onChange={(e) => update('salary_min', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                  placeholder="Min"
                  className="input h-8 border-surface-300 bg-surface-100 px-2 py-0 text-xs font-medium"
                />
                <input
                  type="number"
                  min={0}
                  value={params.salary_max ?? ''}
                  onChange={(e) => update('salary_max', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                  placeholder="Max"
                  className="input h-8 border-surface-300 bg-surface-100 px-2 py-0 text-xs font-medium"
                />
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveMenu(activeMenu === 'job_type' ? null : 'job_type')}
            className={pillClass((params.job_type?.length ?? 0) > 0)}
          >
            Job type <ChevronDown size={13} />
          </button>
          {activeMenu === 'job_type' && (
            <div className="absolute left-0 top-10 z-30 w-72 rounded-xl border border-surface-300 bg-surface-50 p-3 shadow-modal">
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
                        'px-2 py-1 rounded-md text-[11px] font-semibold transition-colors',
                        selected ? 'bg-brand-500 text-white' : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveMenu(activeMenu === 'experience' ? null : 'experience')}
            className={pillClass((params.experience_level?.length ?? 0) > 0)}
          >
            Experience <ChevronDown size={13} />
          </button>
          {activeMenu === 'experience' && (
            <div className="absolute left-0 top-10 z-30 w-72 rounded-xl border border-surface-300 bg-surface-50 p-3 shadow-modal">
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
                        'px-2 py-1 rounded-md text-[11px] font-semibold transition-colors',
                        selected ? 'bg-brand-500 text-white' : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                      )}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveMenu(activeMenu === 'more' ? null : 'more')}
            className={pillClass(Boolean(params.posted_days || (params.sort_by && params.sort_by !== 'relevance') || (params.skills?.length ?? 0) > 0))}
          >
            More <ChevronDown size={13} />
          </button>
          {activeMenu === 'more' && (
            <div className="absolute left-0 top-10 z-30 w-80 rounded-xl border border-surface-300 bg-surface-50 p-3 shadow-modal space-y-2">
              <input
                type="text"
                value={params.skills?.join(', ') ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
                  update('skills', next.length ? next : undefined);
                }}
                placeholder="Skills: React, TypeScript"
                className="input h-8 border-surface-300 bg-surface-100 px-2 py-0 text-xs font-medium"
              />
              <div className="grid grid-cols-2 gap-2">
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
                  className="input h-8 border-surface-300 bg-surface-100 px-2 py-0 text-xs font-medium"
                >
                  {POSTED_OPTIONS.map((o) => (
                    <option key={o.value || 'any'} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={params.sort_by || 'relevance'}
                  onChange={(e) => update('sort_by', e.target.value)}
                  className="input h-8 border-surface-300 bg-surface-100 px-2 py-0 text-xs font-medium"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-full border border-surface-300 bg-surface-100 px-3 py-1.5 text-xs font-semibold text-surface-600 hover:bg-surface-200 hover:text-surface-800"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
