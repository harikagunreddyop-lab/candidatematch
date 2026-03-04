'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner, StatusBadge, EmptyState } from '@/components/ui';
import { cn } from '@/utils/helpers';
import { Plug, RefreshCw, Play, AlertCircle, CheckCircle2, Clock, Search } from 'lucide-react';

type ConnectorRow = {
  id: string;
  provider: 'greenhouse' | 'lever' | 'ashby' | string;
  source_org: string;
  is_enabled: boolean;
  sync_interval_min: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
};

type DiscoveryRow = {
  id: string;
  company_name: string | null;
  website: string | null;
  detected_provider: string | null;
  detected_source_org: string | null;
  discovered_from_url: string | null;
  validated: boolean;
  validation_status: number | null;
  last_error: string | null;
  created_at: string;
};

type DiscoverySummary = {
  attempted: number;
  detected: number;
  validated: number;
  connectors_created: number;
};

function formatTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function JobBoardsPage() {
  const supabase = createClient();
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [discoveries, setDiscoveries] = useState<DiscoveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [csvPath, setCsvPath] = useState('./data/companies.csv');
  const [csvUrl, setCsvUrl] = useState('');
  const [csvFileContent, setCsvFileContent] = useState<string | null>(null);
  const [limit, setLimit] = useState<number | undefined>(2000);
  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoverySummary | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [connRes, discRes] = await Promise.all([
        supabase.from('ingest_connectors')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('board_discoveries')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      setConnectors((connRes.data || []) as ConnectorRow[]);
      setDiscoveries((discRes.data || []) as DiscoveryRow[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providerCounts = connectors.reduce<Record<string, number>>((acc, c) => {
    acc[c.provider] = (acc[c.provider] || 0) + 1;
    return acc;
  }, {});

  const filteredConnectors = connectors.filter((c) => {
    const q = filter.toLowerCase();
    if (!q) return true;
    return (
      c.provider.toLowerCase().includes(q) ||
      c.source_org.toLowerCase().includes(q)
    );
  });

  const runSync = async (id: string) => {
    setSyncingId(id);
    setSyncMsg(null);
    try {
      const res = await fetch(`/api/connectors/${id}/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Sync failed');
      }
      setSyncMsg(
        `Synced ${data.provider}/${data.sourceOrg} – fetched ${data.fetched ?? 0}, upserted ${data.upserted ?? 0}, closed ${data.closed ?? 0}, promoted ${data.promoted ?? 0} to jobs`
      );
    } catch (err: any) {
      setSyncMsg(`Sync failed: ${err?.message || String(err)}`);
    } finally {
      setSyncingId(null);
    }
  };

  const runDiscovery = async () => {
    const hasInput = (csvPath && csvPath.trim()) || (csvUrl && csvUrl.trim()) || csvFileContent;
    if (!hasInput) {
      setDiscoveryError('Provide a CSV path, URL, or upload a file');
      return;
    }
    setRunningDiscovery(true);
    setDiscoveryError(null);
    setDiscoveryResult(null);
    try {
      const body: { csvPath?: string; csvUrl?: string; csvContent?: string; limit?: number } = {};
      if (csvFileContent) body.csvContent = csvFileContent;
      else if (csvUrl.trim()) body.csvUrl = csvUrl.trim();
      else body.csvPath = csvPath.trim();
      if (limit && limit > 0) body.limit = limit;
      const res = await fetch('/api/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Discovery failed');
      }
      setDiscoveryResult(data as DiscoverySummary);

      // Refresh connectors/discoveries snapshot after run
      const [connRes, discRes] = await Promise.all([
        supabase.from('ingest_connectors')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('board_discoveries')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      setConnectors((connRes.data || []) as ConnectorRow[]);
      setDiscoveries((discRes.data || []) as DiscoveryRow[]);
    } catch (err: any) {
      setDiscoveryError(err?.message || 'Discovery failed');
    } finally {
      setRunningDiscovery(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
            <Plug size={20} /> ATS Job Boards
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Discover public Greenhouse / Lever / Ashby boards and manage Type-B job ingestion connectors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 top-2.5" />
            <input
              className="input pl-7 pr-3 py-1.5 text-sm w-48"
              placeholder="Filter connectors..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <button
            onClick={async () => {
              setLoading(true);
              const [connRes, discRes] = await Promise.all([
                supabase.from('ingest_connectors')
                  .select('*')
                  .order('created_at', { ascending: false }),
                supabase.from('board_discoveries')
                  .select('*')
                  .order('created_at', { ascending: false })
                  .limit(30),
              ]);
              setConnectors((connRes.data || []) as ConnectorRow[]);
              setDiscoveries((discRes.data || []) as DiscoveryRow[]);
              setLoading(false);
            }}
            className="btn-ghost text-sm flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-surface-500">Connectors</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{connectors.length}</p>
          <p className="text-[11px] text-surface-400 mt-1">
            {Object.entries(providerCounts).map(([p, c]) => `${p}: ${c}`).join(' · ') || 'No connectors yet'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-surface-500">Latest discoveries</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{discoveries.length}</p>
          <p className="text-[11px] text-surface-400 mt-1">
            Showing newest 30 discovery records
          </p>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-300" />
          </div>
          <div>
            <p className="text-xs font-medium text-surface-500">Discovery runner</p>
            <p className="text-[11px] text-surface-400 mt-0.5">
              Uses <code className="bg-surface-100 dark:bg-surface-700 px-1 rounded text-[10px]">/api/discovery/run</code> and <code className="bg-surface-100 dark:bg-surface-700 px-1 rounded text-[10px]">data/companies.csv</code>.
            </p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <Clock size={16} className="text-blue-600 dark:text-blue-300" />
          </div>
          <div>
            <p className="text-xs font-medium text-surface-500">Type-B ingest</p>
            <p className="text-[11px] text-surface-400 mt-0.5">
              Connectors feed <code className="bg-surface-100 dark:bg-surface-700 px-1 rounded text-[10px]">ingest_jobs</code> via <code className="bg-surface-100 dark:bg-surface-700 px-1 rounded text-[10px]">ingest:run</code>.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connectors list */}
        <div className="lg:col-span-2 card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-100 flex items-center gap-2">
                <Plug size={14} /> Connectors
              </h2>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                Type-B job ingestion connectors discovered from public job boards.
              </p>
            </div>
          </div>

          {filteredConnectors.length === 0 ? (
            <EmptyState
              icon={<Plug size={20} className="text-brand-600" />}
              title="No connectors yet"
              description="Run board discovery or add connectors via the API to start ingesting jobs."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-xs text-surface-500 border-b border-surface-100 dark:border-surface-700">
                    <th className="text-left py-2 pr-3 font-medium">Provider</th>
                    <th className="text-left py-2 pr-3 font-medium">Source org</th>
                    <th className="text-left py-2 pr-3 font-medium">Status</th>
                    <th className="text-left py-2 pr-3 font-medium">Last run</th>
                    <th className="text-left py-2 pr-3 font-medium">Last success</th>
                    <th className="text-left py-2 pr-3 font-medium">Error</th>
                    <th className="text-right py-2 pl-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConnectors.map((c) => (
                    <tr key={c.id} className="border-b border-surface-100 dark:border-surface-800/60">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300">
                          {c.provider}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-surface-800 dark:text-surface-100 whitespace-nowrap">
                        {c.source_org}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={c.is_enabled ? 'active' : 'inactive'} />
                      </td>
                      <td className="py-2 pr-3 text-xs text-surface-500 dark:text-surface-400">
                        {formatTime(c.last_run_at)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-surface-500 dark:text-surface-400">
                        {formatTime(c.last_success_at)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-red-500 dark:text-red-300 max-w-xs truncate" title={c.last_error || ''}>
                        {c.last_error ? c.last_error.slice(0, 80) : '—'}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <button
                          onClick={() => runSync(c.id)}
                          disabled={!!syncingId}
                          className={cn(
                            'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors',
                            syncingId === c.id
                              ? 'border-surface-300 text-surface-500 bg-surface-50 dark:bg-surface-800'
                              : 'border-brand-500 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10'
                          )}
                        >
                          {syncingId === c.id ? (
                            <>
                              <Spinner size={12} /> Syncing...
                            </>
                          ) : (
                            <>
                              <Play size={12} /> Sync now
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {syncMsg && (
            <div className="mt-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 px-4 py-2 text-xs text-surface-700 dark:text-surface-200">
              {syncMsg}
            </div>
          )}
        </div>

        {/* Discovery runner + recent discoveries */}
        <div className="space-y-4">
          <div className="card p-4 sm:p-5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-100 flex items-center gap-2">
                <Plug size={14} /> Run board discovery
              </h2>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                Kicks off the Type-B board discovery pipeline over a CSV of company websites.
              </p>
            </div>

            {discoveryError && (
              <div className="flex items-center gap-2 text-xs rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-red-700 dark:text-red-200">
                <AlertCircle size={12} /> {discoveryError}
              </div>
            )}

            {discoveryResult && (
              <div className="flex items-center gap-2 text-xs rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-emerald-700 dark:text-emerald-200">
                <CheckCircle2 size={12} />
                <span>
                  Attempted {discoveryResult.attempted} companies · detected {discoveryResult.detected} boards · validated{' '}
                  {discoveryResult.validated} · connectors created {discoveryResult.connectors_created}
                </span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="label text-xs">CSV path (local)</label>
                <input
                  className="input text-xs"
                  value={csvPath}
                  onChange={(e) => { setCsvPath(e.target.value); setCsvFileContent(null); }}
                  placeholder="./data/companies.csv"
                />
              </div>
              <div>
                <label className="label text-xs">CSV URL (serverless)</label>
                <input
                  className="input text-xs"
                  value={csvUrl}
                  onChange={(e) => { setCsvUrl(e.target.value); setCsvFileContent(null); }}
                  placeholder="https://example.com/companies.csv"
                />
              </div>
              <div>
                <label className="label text-xs">Or upload CSV</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="block w-full text-xs text-surface-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary-100 file:text-primary-700 dark:file:bg-primary-900/30 dark:file:text-primary-300"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) { setCsvFileContent(null); return; }
                    const r = new FileReader();
                    r.onload = () => { setCsvFileContent((r.result as string) || null); };
                    r.readAsText(f);
                  }}
                />
                {csvFileContent && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                    Loaded {Math.min(csvFileContent.split(/\r?\n/).length - 1, 9999)}+ rows
                  </p>
                )}
              </div>
              <p className="text-[10px] text-surface-400">
                Upload or URL works in serverless. Path only works when file exists on server.
              </p>
              <div>
                <label className="label text-xs">Limit (optional)</label>
                <input
                  type="number"
                  min={1}
                  className="input text-xs w-28"
                  value={limit ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setLimit(undefined);
                    } else {
                      setLimit(Math.max(1, Number(v)));
                    }
                  }}
                  placeholder="2000"
                />
              </div>
            </div>

            <button
              onClick={runDiscovery}
              disabled={runningDiscovery}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              {runningDiscovery ? (
                <>
                  <Spinner size={12} /> Running discovery...
                </>
              ) : (
                <>
                  <Play size={12} /> Run discovery
                </>
              )}
            </button>

            <p className="text-[11px] text-surface-400">
              This calls <code className="bg-surface-100 dark:bg-surface-700 px-1 rounded text-[10px]">POST /api/discovery/run</code>{' '}
              on the server. To generate a large CSV locally, run{' '}
              <code className="bg-surface-100 dark:bg-surface-700 px-1 rounded text-[10px]">npm run generate:companies</code>, then
              trigger discovery either here or via{' '}
              <code className="bg-surface-100 dark:bg-surface-700 px-1 rounded text-[10px]">npm run discovery:run</code> in the CLI.
            </p>
          </div>

          <div className="card p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-100">
                Recent discoveries
              </h2>
            </div>

            {discoveries.length === 0 ? (
              <EmptyState
                icon={<AlertCircle size={18} className="text-surface-400" />}
                title="No discovery records yet"
                description="Once you run discovery, the last 30 attempts will show up here."
              />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {discoveries.map((d) => (
                  <div
                    key={d.id}
                    className="border border-surface-100 dark:border-surface-700 rounded-lg px-3 py-2.5 text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-surface-800 dark:text-surface-100 truncate">
                          {d.company_name || 'Unknown company'}
                        </span>
                        {d.detected_provider && (
                          <span className="px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-[10px] font-semibold text-surface-700 dark:text-surface-300">
                            {d.detected_provider} / {d.detected_source_org}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-surface-400 whitespace-nowrap">
                        {formatTime(d.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-surface-500 dark:text-surface-400 truncate">
                        {d.discovered_from_url || d.website || '—'}
                      </div>
                      <StatusBadge status={d.validated ? 'active' : 'inactive'} />
                    </div>
                    {d.last_error && (
                      <div className="text-[11px] text-red-500 dark:text-red-300 mt-0.5 truncate" title={d.last_error}>
                        {d.last_error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

