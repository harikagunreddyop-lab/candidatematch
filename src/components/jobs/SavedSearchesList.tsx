'use client';

import { useState, useEffect } from 'react';
import { Bookmark, Trash2, Search } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { JobSearchParams } from './JobSearchBar';

export interface SavedSearchItem {
  id: string;
  search_name: string;
  search_params: Record<string, unknown>;
  alert_frequency?: string | null;
  created_at: string;
}

export interface SavedSearchesListProps {
  onLoadSearch: (params: JobSearchParams) => void;
  className?: string;
}

export function SavedSearchesList({ onLoadSearch, className }: SavedSearchesListProps) {
  const [list, setList] = useState<SavedSearchItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await fetch('/api/candidate/saved-searches', { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    setList(data.saved_searches ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    await fetch(`/api/candidate/saved-searches/${id}`, { method: 'DELETE', credentials: 'include' });
    setList((prev) => prev.filter((s) => s.id !== id));
  };

  const toParams = (p: Record<string, unknown>): JobSearchParams => ({
    query: p.query as string | undefined,
    location: p.location as string | undefined,
    remote_type: p.remote_type as string | undefined,
    salary_min: p.salary_min as number | undefined,
    salary_max: p.salary_max as number | undefined,
    job_type: p.job_type as string[] | undefined,
    experience_level: p.experience_level as string[] | undefined,
    skills: p.skills as string[] | undefined,
    posted_after: p.posted_after as string | undefined,
    sort_by: p.sort_by as string | undefined,
    posted_days: p.posted_days as string | undefined,
  });

  if (loading || list.length === 0) return null;

  return (
    <div className={cn('rounded-2xl border border-surface-300 bg-surface-50 p-4', className)}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-surface-900">
        <Bookmark size={14} /> Saved searches
      </h3>
      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 group rounded-lg border border-surface-300 bg-surface-100 px-2 py-1.5">
            <button
              type="button"
              onClick={() => onLoadSearch(toParams(s.search_params))}
              className="flex flex-1 items-center gap-1.5 truncate text-left text-sm font-semibold text-surface-800 hover:text-surface-900"
            >
              <Search size={12} />
              {s.search_name}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(s.id)}
              className="p-1.5 rounded text-surface-500 opacity-0 transition-opacity hover:bg-surface-200 hover:text-red-600 group-hover:opacity-100"
              title="Delete saved search"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
