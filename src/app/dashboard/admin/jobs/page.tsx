'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient, subscribeWithLog } from '@/lib/supabase-browser';
import { SearchInput, EmptyState, Spinner, Modal } from '@/components/ui';
import { Briefcase, ExternalLink, Eye, RefreshCw, AlertCircle } from 'lucide-react';
import { formatRelative, truncate, cn } from '@/utils/helpers';
import { JobBoardsPanel } from '@/components/admin/JobBoardsPanel';
import { useSearchParams, useRouter } from 'next/navigation';

interface AdminJob {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  source: string | null;
  scraped_at: string | null;
  url: string | null;
  salary_min: number | null;
  salary_max: number | null;
  job_type: string | null;
  remote_type: string | null;
  jd_clean: string | null;
}

export default function JobsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get('tab') === 'boards' ? 'boards' : 'jobs') as 'jobs' | 'boards';
  const [tab, setTab] = useState<'jobs' | 'boards'>(initialTab);

  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<AdminJob | null>(null);
  const [page, setPage] = useState(0);
  const [liveMatchCount, setLiveMatchCount] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const supabase = createClient();

  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

  const sourceFilterRef = useRef(sourceFilter);
  useEffect(() => { sourceFilterRef.current = sourceFilter; setPage(0); }, [sourceFilter]);
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const searchRef = useRef(debouncedSearch);
  useEffect(() => { searchRef.current = debouncedSearch; setPage(0); }, [debouncedSearch]);

  // Live match count (in sync with Reports & Analytics) — defined before load so load can call it
  const fetchMatchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/match-stats', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.totalMatches === 'number') setLiveMatchCount(data.totalMatches);
    } catch {
      // ignore
    }
  }, []);

  const loadingRef = useRef(false);
  const load = useCallback(async (silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const currentPage = pageRef.current;
    const currentSource = sourceFilterRef.current;
    const currentSearch = searchRef.current;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ page: String(currentPage), pageSize: '10' });
      if (currentSource !== 'all') params.set('source', currentSource);
      if (currentSearch) params.set('q', currentSearch);
      const res = await fetch(`/api/admin/jobs?${params}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Failed to load jobs');
      } else {
        setJobs((data.jobs || []) as AdminJob[]);
        setTotalCount(data.totalCount || 0);
        setLastRefreshed(new Date());
        fetchMatchStats();
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchMatchStats]);

  useEffect(() => {
    // Keep state in sync if user lands on a tab via URL.
    const next = (searchParams.get('tab') === 'boards' ? 'boards' : 'jobs') as 'jobs' | 'boards';
    setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams?.get('tab')]);

  useEffect(() => {
    if (tab !== 'jobs') return;
    load();
  }, [page, load, tab]);

  useEffect(() => {
    if (tab !== 'jobs') return;
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [load, tab]);

  // Fetch live match count when Jobs tab is shown
  useEffect(() => {
    if (tab !== 'jobs') return;
    fetchMatchStats();
  }, [tab, fetchMatchStats]);

  // Realtime: stay in sync when jobs are ingested or updated
  useEffect(() => {
    if (tab !== 'jobs') return;
    const channel = supabase
      .channel('admin-jobs-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => load(true));
    subscribeWithLog(channel, 'admin-jobs-sync');
    return () => { supabase.removeChannel(channel); };
  }, [supabase, load, tab]);

  const formatScrapedAtSafe = (scrapedAt: string | null) => {
    if (!scrapedAt) return '—';
    return formatRelative(scrapedAt);
  };

  return (
    <div className="space-y-6">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Jobs</h1>
          <div className="mt-3 admin-segmented">
            <button
              onClick={() => { setTab('jobs'); router.replace('/dashboard/admin/jobs'); }}
              className={cn('admin-segmented-btn', tab === 'jobs' && 'is-active')}
            >
              Jobs
            </button>
            <button
              onClick={() => { setTab('boards'); router.replace('/dashboard/admin/jobs?tab=boards'); }}
              className={cn('admin-segmented-btn', tab === 'boards' && 'is-active')}
            >
              Job boards
            </button>
          </div>
          {tab === 'jobs' && (
            <p className="admin-page-subtitle mt-2">
              {totalCount.toLocaleString()} jobs · page {page + 1}
              {lastRefreshed && (
                <span className="text-surface-400">
                  {' '}· updated {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </p>
          )}
        </div>
        {tab === 'jobs' && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => load()} className="btn-ghost text-sm flex items-center gap-1.5">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        )}
      </div>

      {tab === 'boards' ? (
        <JobBoardsPanel onSyncComplete={() => load()} />
      ) : (
        <>
          {liveMatchCount !== null && (
            <div className="rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-100/80 text-surface-700 dark:text-surface-300 px-4 py-3 text-sm">
              Auto-matching runs whenever new jobs are ingested. Current total matches: {liveMatchCount.toLocaleString()}.
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Failed to load jobs</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by title or company..." />
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              aria-label="Filter by source"
              title="Filter by source"
              className="input text-sm w-full sm:w-36 shrink-0"
            >
              <option value="all">All sources</option>
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
              <option value="linkedin">LinkedIn</option>
              <option value="indeed">Indeed</option>
              <option value="manual">Manual</option>
              <option value="import">Imported</option>
              <option value="seed">Seed</option>
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner size={28} /></div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={<Briefcase size={24} />}
              title={debouncedSearch ? 'No jobs found' : 'No jobs yet'}
              description={
                debouncedSearch
                  ? 'Try a different search term, clear filters, or refresh.'
                  : 'Switch to the Job boards tab and run Sync all to pull jobs from enabled connectors. Then click Refresh to see them here.'
              }
            />
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Company</th>
                    <th>Location</th>
                    <th>Source</th>
                    <th>Added</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(j => (
                    <tr key={j.id}>
                      <td className="font-medium text-surface-900 max-w-[250px] truncate">{j.title || 'Untitled'}</td>
                      <td>{j.company || '—'}</td>
                      <td className="text-surface-500">{truncate(j.location || '—', 25)}</td>
                      <td><span className="badge-neutral text-xs capitalize">{j.source || 'unknown'}</span></td>
                      <td className="text-surface-500 text-xs">{formatScrapedAtSafe(j.scraped_at)}</td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => setViewing(j)} className="btn-ghost p-1.5" title="View JD">
                            <Eye size={14} />
                          </button>
                          {j.url && (
                            <a href={j.url} target="_blank" rel="noreferrer" className="btn-ghost p-1.5" title="Open original">
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-5 py-3 border-t border-surface-200">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-ghost text-xs">← Prev</button>
                <span className="text-xs text-surface-500">
                  Showing {page * 10 + 1}–{Math.min((page + 1) * 10, totalCount)} of {totalCount.toLocaleString()}
                </span>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 10 >= totalCount} className="btn-ghost text-xs">Next →</button>
              </div>
            </div>
          )}

          {viewing && (
            <Modal open onClose={() => setViewing(null)} title={viewing.title || 'Job Details'} size="lg">
              <div className="space-y-3">
                <p className="text-sm"><strong>Company:</strong> {viewing.company}</p>
                <p className="text-sm"><strong>Location:</strong> {viewing.location || 'N/A'}</p>
                {viewing.salary_min && (
                  <p className="text-sm">
                    <strong>Salary:</strong> ${viewing.salary_min.toLocaleString()}
                    {viewing.salary_max ? ` – $${viewing.salary_max.toLocaleString()}` : '+'}
                  </p>
                )}
                {viewing.job_type && <p className="text-sm"><strong>Type:</strong> {viewing.job_type}</p>}
                {viewing.remote_type && <p className="text-sm"><strong>Remote:</strong> {viewing.remote_type}</p>}
                {viewing.url && (
                  <a href={viewing.url} target="_blank" rel="noreferrer"
                    className="text-sm text-brand-600 hover:underline flex items-center gap-1">
                    <ExternalLink size={12} /> View original posting
                  </a>
                )}
                <div className="mt-4 p-4 bg-surface-100 rounded-xl max-h-[400px] overflow-y-auto">
                  <p className="text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap">
                    {viewing.jd_clean || 'No description available'}
                  </p>
                </div>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}