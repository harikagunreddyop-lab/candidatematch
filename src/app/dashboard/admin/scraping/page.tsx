'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { StatusBadge, EmptyState, Spinner, Modal } from '@/components/ui';
import { Play, Clock, RefreshCw, ChevronLeft, ChevronRight, Trash2, Square } from 'lucide-react';

type ScrapeRun = {
  id: string;
  actor_id: string;
  search_query: string;
  status: 'running' | 'completed' | 'failed';
  jobs_found: number;
  jobs_new: number;
  jobs_duplicate: number;
  error_message?: string;
  started_at: string;
};

const PAGE_SIZE = 10;
const DEFAULT_QUERIES = `Software Engineer
Data Scientist
Product Manager
Frontend Developer
Backend Developer`;

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function sourceLabel(actorId: string) {
  if (actorId.includes('linkedin') || actorId.includes('cheerio')) return 'linkedin';
  if (actorId.includes('indeed')) return 'indeed';
  return actorId.split('/').pop() || actorId;
}

export default function ScrapingPage() {
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [queries, setQueries] = useState(DEFAULT_QUERIES);
  const [location, setLocation] = useState('');
  const [maxResults, setMaxResults] = useState(50);
  const [sources, setSources] = useState({ linkedin: true, indeed: false });
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const [histPage, setHistPage] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [stopping, setStopping] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const supabase = createClient();

  const loadRuns = useCallback(async () => {
    const res = await fetch('/api/scraping');
    if (res.ok) {
      const { runs: data } = await res.json();
      setRuns(data || []);
    }
    setLoading(false);
  }, []);

  const loadJobCount = useCallback(async () => {
    const { count } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true });
    setJobCount(count ?? 0);
  }, []);

  useEffect(() => {
    loadRuns();
    loadJobCount();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadRuns, loadJobCount]);

  const startScrape = async () => {
    const selectedSources = Object.entries(sources).filter(([, v]) => v).map(([k]) => k);
    const queryList = queries.split('\n').map(q => q.trim()).filter(Boolean);
    if (!queryList.length) { alert('Add at least one search query.'); return; }
    if (!selectedSources.length) { alert('Select at least one source.'); return; }

    setScraping(true);
    setStopping(false);
    setHistPage(0);
    setLiveLog([`🚀 ${queryList.length} quer${queryList.length > 1 ? 'ies' : 'y'} × ${selectedSources.join(', ')}...`]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/scraping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_queries: queryList,
          sources: selectedSources,
          location,
          max_results_per_query: maxResults,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        setLiveLog(l => [...l, `❌ ${data.error || 'Unknown error'}`]);
        setScraping(false);
        return;
      }
      for (const r of (data.results || [])) {
        if (r.error) {
          setLiveLog(l => [...l, `❌ [${r.source}] "${r.query}": ${r.error}`]);
        } else {
          setLiveLog(l => [...l, `✅ [${r.source}] "${r.query}": +${r.jobs_new} new, ${r.jobs_duplicate || 0} dupes`]);
        }
      }
      setLiveLog(l => [...l, '✅ All runs complete.']);
      await loadRuns();
      await loadJobCount();
      setScraping(false);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setLiveLog(l => [...l, '⛔ Scraping stopped by user.']);
      } else {
        setLiveLog(l => [...l, `❌ Request failed: ${e.message}`]);
      }
      setScraping(false);
    } finally {
      abortRef.current = null;
    }
  };

  const stopScrape = async () => {
    setStopping(true);
    abortRef.current?.abort();
    try {
      await fetch('/api/scraping', { method: 'DELETE' });
    } catch {}
    await loadRuns();
    setScraping(false);
    setStopping(false);
  };

  const clearAllJobs = async () => {
    setClearing(true);
    // Delete all jobs — cascade will also remove matches, applications, resume_versions
    const { error } = await supabase.from('jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (!error) {
      // Also clear scrape_runs history
      await supabase.from('scrape_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setRuns([]);
      setJobCount(0);
      setLiveLog([]);
      setHistPage(0);
    }
    setClearing(false);
    setShowClearConfirm(false);
  };

  const runningCount = runs.filter(r => r.status === 'running').length;
  const totalNew = runs.reduce((a, r) => a + (r.jobs_new || 0), 0);
  const totalPages = Math.ceil(runs.length / PAGE_SIZE);
  const pagedRuns = runs.slice(histPage * PAGE_SIZE, (histPage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Job Scraping</h1>
          <p className="text-sm text-surface-500 mt-1">Pull real jobs from LinkedIn & Indeed via Apify</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadJobCount(); setShowClearConfirm(true); }}
            disabled={scraping}
            className="btn-ghost text-sm flex items-center gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200">
            <Trash2 size={14} /> Clear All Jobs
          </button>
          <button onClick={() => { loadRuns(); loadJobCount(); }} className="btn-ghost text-sm flex items-center gap-1.5">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-surface-900">{runs.reduce((a, r) => a + (r.jobs_found || 0), 0).toLocaleString()}</p>
          <p className="text-xs text-surface-500 mt-1">Total Found</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-brand-600">{totalNew.toLocaleString()}</p>
          <p className="text-xs text-surface-500 mt-1">New Jobs Added</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-surface-900">{jobCount ?? '—'}</p>
          <p className="text-xs text-surface-500 mt-1">Jobs in Database</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-surface-800">New Scrape Run</h3>
            <div>
              <label className="label">Search Queries <span className="text-surface-400">(one per line)</span></label>
              <textarea className="input text-sm h-36 resize-none font-mono" value={queries}
                onChange={e => setQueries(e.target.value)} disabled={scraping} />
            </div>
            <div>
              <label className="label">Location <span className="text-surface-400">(optional)</span></label>
              <input className="input text-sm" placeholder="e.g. New York, Remote" value={location}
                onChange={e => setLocation(e.target.value)} disabled={scraping} />
            </div>
            <div>
              <label className="label">Max Results Per Query</label>
              <select className="input text-sm" value={maxResults} aria-label="Max results"
                onChange={e => setMaxResults(Number(e.target.value))} disabled={scraping}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
            <div>
              <label className="label">Sources</label>
              <div className="flex gap-4">
                {(['linkedin', 'indeed'] as const).map(s => (
                  <label key={s} className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                    <input type="checkbox" checked={sources[s]}
                      onChange={e => setSources(p => ({ ...p, [s]: e.target.checked }))}
                      disabled={scraping}
                      className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                    <span className="capitalize">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={startScrape} disabled={scraping} className="btn-primary text-sm flex-1">
                {scraping
                  ? <><Spinner size={14} /> Running{runningCount > 0 ? ` (${runningCount})` : ''}...</>
                  : <><Play size={14} /> Start Scrape</>}
              </button>
              {scraping && (
                <button onClick={stopScrape} disabled={stopping} className="btn-ghost text-sm flex items-center gap-1.5 px-4 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 border border-red-200 dark:border-red-500/30">
                  {stopping ? <Spinner size={14} /> : <Square size={14} />} Stop
                </button>
              )}
            </div>
            <p className="text-xs text-surface-400">
              Requires <code className="bg-surface-100 px-1 rounded">APIFY_API_TOKEN</code> in <code className="bg-surface-100 px-1 rounded">.env</code>
            </p>
          </div>

          {/* Live log */}
          {liveLog.length > 0 && (
            <div className="card p-4">
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">Live Log</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {liveLog.map((line, i) => (
                  <p key={i} className="text-xs font-mono text-surface-700">{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* History panel */}
        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-surface-800">Scrape History</h3>
                {runs.length > 0 && <span className="text-xs text-surface-400">{runs.length} total</span>}
              </div>
              {runningCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                  <Spinner size={12} /> {runningCount} running
                </span>
              )}
            </div>

            {loading ? <div className="flex justify-center py-10"><Spinner /></div> :
            runs.length === 0 ? <div className="p-6"><EmptyState icon={<Clock size={24} />} title="No runs yet" description="Start your first scrape" /></div> :
            <>
              <div className="grid grid-cols-[48px_60px_80px_1fr_80px_72px] gap-2 px-4 py-1.5 bg-surface-50 border-b border-surface-100 text-xs font-medium text-surface-400 uppercase tracking-wide">
                <span>Day</span><span>Time</span><span>Source</span><span>Query</span><span className="text-right">New / Found</span><span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-surface-50">
                {pagedRuns.map(r => (
                  <div key={r.id} className="grid grid-cols-[48px_60px_80px_1fr_80px_72px] gap-2 items-center px-4 py-2 text-xs hover:bg-surface-50 transition-colors">
                    <span className="text-surface-400 font-medium">{dayLabel(r.started_at)}</span>
                    <span className="text-surface-400 tabular-nums">{fmtTime(r.started_at)}</span>
                    <span><span className="badge-neutral capitalize">{sourceLabel(r.actor_id)}</span></span>
                    <span className="text-surface-700 font-medium truncate">{r.search_query}</span>
                    <span className="text-right tabular-nums">
                      {r.status === 'completed' && <><span className="text-green-600 font-semibold">+{r.jobs_new || 0}</span><span className="text-surface-400"> / {r.jobs_found || 0}</span></>}
                      {r.status === 'running' && <span className="text-amber-500">—</span>}
                      {r.status === 'failed' && <span className="text-red-400 truncate block max-w-[76px]" title={r.error_message}>{(r.error_message || 'failed').slice(0, 12)}…</span>}
                    </span>
                    <span className="flex justify-end"><StatusBadge status={r.status} /></span>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-surface-200 bg-surface-50">
                  <button onClick={() => setHistPage(p => Math.max(0, p - 1))} disabled={histPage === 0} className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40"><ChevronLeft size={13} /> Prev</button>
                  <span className="text-xs text-surface-500">{histPage * PAGE_SIZE + 1}–{Math.min((histPage + 1) * PAGE_SIZE, runs.length)} of {runs.length}</span>
                  <button onClick={() => setHistPage(p => Math.min(totalPages - 1, p + 1))} disabled={histPage >= totalPages - 1} className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40">Next <ChevronRight size={13} /></button>
                </div>
              )}
            </>}
          </div>
        </div>
      </div>

      {/* Clear All Confirmation Modal */}
      <Modal open={showClearConfirm} onClose={() => setShowClearConfirm(false)} title="Clear All Jobs" size="sm">
        <div className="space-y-3 mb-6">
          <p className="text-sm text-surface-700">
            This will permanently delete all <strong>{jobCount?.toLocaleString() ?? '—'} jobs</strong> and the scrape history from the database.
          </p>
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            ⚠️ This also deletes all job matches, applications, and generated resumes linked to these jobs. This cannot be undone.
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowClearConfirm(false)} className="btn-secondary text-sm">Cancel</button>
          <button onClick={clearAllJobs} disabled={clearing} className="btn-primary text-sm !bg-red-600 !border-red-600 min-w-[100px]">
            {clearing ? <Spinner size={14} /> : 'Delete All'}
          </button>
        </div>
      </Modal>
    </div>
  );
}