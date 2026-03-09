'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
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
  sort_by?: string;
  // Optional (for filter chips and saved searches)
  posted_days?: string;
  company_size?: string[];
  industry?: string[];
  visa_sponsorship?: boolean;
  benefits?: string[];
  application_deadline_before?: string;
}

export interface JobSearchBarProps {
  initialQuery?: string;
  initialLocation?: string;
  onSearch: (params: JobSearchParams) => void;
  placeholder?: string;
  className?: string;
}

const DEBOUNCE_MS = 350;

export function JobSearchBar({
  initialQuery = '',
  initialLocation = '',
  onSearch,
  placeholder = 'Job title, company, or keywords…',
  className,
}: JobSearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);

  useEffect(() => {
    setQuery(initialQuery);
    setLocation(initialLocation);
  }, [initialQuery, initialLocation]);

  const emit = useCallback(() => {
    onSearch({
      query: query.trim() || undefined,
      location: location.trim() || undefined,
    });
  }, [query, location, onSearch]);

  useEffect(() => {
    const t = setTimeout(emit, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, location, emit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    emit();
  };

  return (
    <form onSubmit={handleSubmit} className={cn('flex flex-col sm:flex-row gap-2', className)}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="input pl-10 w-full py-2.5 rounded-xl bg-surface-800/80 border-surface-700 text-surface-100 placeholder-surface-500 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          aria-label="Search jobs"
        />
      </div>
      <input
        type="text"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location"
        className="input w-full sm:w-44 py-2.5 rounded-xl bg-surface-800/80 border-surface-700 text-surface-100 placeholder-surface-500"
        aria-label="Location"
      />
      <button type="submit" className="btn-primary py-2.5 px-4 rounded-xl shrink-0">
        Search
      </button>
    </form>
  );
}
