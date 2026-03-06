'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient, subscribeWithLog } from '@/lib/supabase-browser';
import { SearchInput, Spinner, EmptyState } from '@/components/ui';
import { Briefcase, MapPin, Building2, ExternalLink, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/helpers';

const PAGE_SIZE = 12;
const SOURCES = [
  { value: 'all', label: 'All sources' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'lever', label: 'Lever' },
  { value: 'ashby', label: 'Ashby' },
  { value: 'manual', label: 'Manual' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'indeed', label: 'Indeed' },
];

interface JobSearchViewProps {
  role: 'candidate' | 'recruiter';
}

export function JobSearchView({ role }: JobSearchViewProps) {
  const supabase = createClient();
  const [jobs, setJobs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    let listQ = supabase
      .from('jobs')
      .select('id, title, company, location, url, source, scraped_at, remote_type', { count: 'exact' })
      .eq('is_active', true)
      .order('scraped_at', { ascending: false });

    if (sourceFilter !== 'all') listQ = listQ.eq('source', sourceFilter);
    if (debouncedQuery.trim()) {
      const q = `%${debouncedQuery.trim()}%`;
      listQ = listQ.or(`title.ilike.${q},company.ilike.${q}`);
    }
    if (locationFilter.trim()) {
      listQ = listQ.ilike('location', `%${locationFilter.trim()}%`);
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count, error } = await listQ.range(from, to);

    if (!error) {
      setJobs(data ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [supabase, page, debouncedQuery, locationFilter, sourceFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: refresh when jobs change (new ingest, deactivate, etc.)
  useEffect(() => {
    const channel = supabase
      .channel('job-search-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => load());
    subscribeWithLog(channel, 'job-search-sync');
    return () => { supabase.removeChannel(channel); };
  }, [supabase, load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-surface-900">
      {/* Hero search section */}
      <div className="relative overflow-hidden border-b border-surface-700/60">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--role-accent)]/8 via-transparent to-transparent" />
        <div className="relative px-4 sm:px-6 py-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-surface-100 font-display tracking-tight">
            {role === 'candidate' ? 'Find your next role' : 'Browse jobs'}
          </h1>
          <p className="text-surface-400 mt-1 text-sm">
            {total > 0 ? `${total.toLocaleString()} active jobs` : 'Search across all job boards'}
          </p>

          <div className="mt-6 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input
                  type="text"
                  placeholder="Job title, company..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="input pl-10 w-full py-2.5 rounded-xl bg-surface-800/80 border-surface-700 focus:border-[var(--role-accent)]"
                />
              </div>
              <input
                type="text"
                placeholder="Location"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="input w-full sm:w-48 py-2.5 rounded-xl bg-surface-800/80 border-surface-700"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter size={14} className="text-surface-500" />
              {SOURCES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => { setSourceFilter(s.value); setPage(0); }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    sourceFilter === s.value
                      ? 'bg-[var(--role-accent)] text-white'
                      : 'bg-surface-800 text-surface-400 hover:bg-surface-700 hover:text-surface-300'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size={28} />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={40} className="text-surface-500" />}
            title="No jobs found"
            description="Try adjusting your search or filters."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-surface-700/60">
                <p className="text-sm text-surface-500">
                  Page {page + 1} of {totalPages} · {total} jobs
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="btn-ghost p-2 rounded-lg disabled:opacity-40"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="btn-ghost p-2 rounded-lg disabled:opacity-40"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: any }) {
  const applyUrl = job.url || '#';
  const isExternal = applyUrl.startsWith('http');

  return (
    <article
      className={cn(
        'group rounded-2xl border border-surface-700/60 bg-surface-800/50 p-5',
        'hover:border-[var(--role-accent)]/40 hover:bg-surface-800/80 transition-all duration-200'
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-surface-100 truncate group-hover:text-[var(--role-accent)] transition-colors">
            {job.title || 'Untitled'}
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-surface-400">
            <span className="flex items-center gap-1">
              <Building2 size={12} />
              {job.company || '—'}
            </span>
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {job.location}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface-700/80 text-surface-400 uppercase font-medium">
              {job.source || 'unknown'}
            </span>
            {job.remote_type && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface-700/80 text-surface-400">
                {job.remote_type}
              </span>
            )}
          </div>
        </div>
        <a
          href={isExternal ? applyUrl : '#'}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium',
            'bg-[var(--role-accent)] text-white hover:opacity-90 transition-opacity shrink-0'
          )}
        >
          Apply
          <ExternalLink size={14} />
        </a>
      </div>
    </article>
  );
}
