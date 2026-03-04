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

export function JobBoardsPanel() {
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

  const load = async () => {
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
  };

  useEffect(() => {
    load();
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
      await load();
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
    setDiscoveryError(null);
    setDiscoveryResult(null);
    setRunningDiscovery(true);
    try {
      const res = await fetch('/api/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_path: csvFileContent ? null : (csvPath || null),
          csv_url: csvFileContent ? null : (csvUrl || null),
          csv_file_content: csvFileContent,
          limit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Discovery failed');
      setDiscoveryResult(data.summary || null);
      await load();
    } catch (e: any) {
      setDiscoveryError(e.message || 'Discovery failed');
    } finally {
      setRunningDiscovery(false);
    }
  };

  const onUploadCsv = async (file: File) => {
    const text = await file.text();
    setCsvFileContent(text);
    setCsvPath('');
    setCsvUrl('');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 font-display">Job boards</h2>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Connectors sync automatically via cron. Use manual sync only when needed.
          </p>
        </div>
        <button onClick={load} className="btn-ghost text-sm flex items-center gap-1.5">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Minimal quick stats */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(providerCounts).map(([p, n]) => (
          <span key={p} className="badge-neutral text-xs capitalize">
            {p}: {n}
          </span>
        ))}
        {!Object.keys(providerCounts).length && (
          <span className="text-xs text-surface-400">No connectors yet</span>
        )}
      </div>

      {syncMsg && (
        <div className={cn(
          'rounded-xl border px-4 py-3 text-sm flex items-start gap-2',
          syncMsg.startsWith('Sync failed')
            ? 'border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200'
            : 'border-green-200 dark:border-green-500/40 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-200'
        )}>
          {syncMsg.startsWith('Sync failed') ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
          <div className="text-xs sm:text-sm">{syncMsg}</div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter connectors…"
            className="input text-sm w-full pl-9"
          />
        </div>
      </div>

      {filteredConnectors.length === 0 ? (
        <EmptyState
          icon={<Plug size={24} />}
          title="No connectors"
          description="Run discovery below to create connectors automatically."
        />
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Source org</th>
                <th>Status</th>
                <th>Interval</th>
                <th>Last run</th>
                <th>Last success</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredConnectors.map((c) => (
                <tr key={c.id}>
                  <td className="capitalize">{c.provider}</td>
                  <td className="font-medium text-surface-900 dark:text-surface-100">{c.source_org}</td>
                  <td>
                    <StatusBadge status={c.is_enabled ? 'enabled' : 'disabled'} />
                  </td>
                  <td className="text-surface-500 text-xs">{c.sync_interval_min}m</td>
                  <td className="text-surface-500 text-xs flex items-center gap-1">
                    <Clock size={12} />
                    {formatTime(c.last_run_at)}
                  </td>
                  <td className="text-surface-500 text-xs">{formatTime(c.last_success_at)}</td>
                  <td className="text-right">
                    <button
                      onClick={() => runSync(c.id)}
                      disabled={!!syncingId}
                      className="btn-secondary text-xs flex items-center gap-1 ml-auto"
                      title="Run sync now"
                    >
                      {syncingId === c.id ? <Spinner size={12} /> : <Play size={12} />}
                      Sync
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Discovery (kept, but visually minimal) */}
      <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">Discover connectors</h3>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
            Provide a companies CSV (path/URL/upload). We’ll detect providers and create connectors.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1">
            <label className="label text-xs">CSV path (server)</label>
            <input value={csvPath} onChange={(e) => setCsvPath(e.target.value)} className="input text-sm w-full" placeholder="./data/companies.csv" />
          </div>
          <div className="lg:col-span-2">
            <label className="label text-xs">CSV URL</label>
            <input value={csvUrl} onChange={(e) => setCsvUrl(e.target.value)} className="input text-sm w-full" placeholder="https://…" />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="label text-xs">Limit</label>
            <input
              type="number"
              value={limit ?? ''}
              onChange={(e) => setLimit(e.target.value ? Number(e.target.value) : undefined)}
              className="input text-sm w-28"
              min={1}
            />
          </div>
          <div className="flex-1">
            <label className="label text-xs">Or upload CSV</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadCsv(f); }}
              className="block text-xs text-surface-500"
            />
          </div>
          <button onClick={runDiscovery} disabled={runningDiscovery} className="btn-primary text-sm flex items-center gap-2">
            {runningDiscovery ? <Spinner size={14} /> : <Plug size={14} />}
            Run discovery
          </button>
        </div>

        {discoveryError && (
          <div className="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-xs text-red-700 dark:text-red-200 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div>{discoveryError}</div>
          </div>
        )}

        {discoveryResult && (
          <div className="rounded-xl border border-brand-200 dark:border-brand-500/40 bg-brand-50 dark:bg-brand-500/10 px-4 py-3 text-xs text-brand-700 dark:text-brand-300">
            Attempted {discoveryResult.attempted}, detected {discoveryResult.detected}, validated {discoveryResult.validated}, connectors created {discoveryResult.connectors_created}.
          </div>
        )}

        {discoveries.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-medium text-surface-600 dark:text-surface-300 mb-2">Recent discoveries</p>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Website</th>
                    <th>Detected</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {discoveries.slice(0, 30).map((d) => (
                    <tr key={d.id}>
                      <td className="font-medium text-surface-900 dark:text-surface-100">{d.company_name || '—'}</td>
                      <td className="text-surface-500 text-xs">{d.website || '—'}</td>
                      <td className="text-surface-500 text-xs">
                        {(d.detected_provider && d.detected_source_org)
                          ? `${d.detected_provider}/${d.detected_source_org}`
                          : '—'}
                      </td>
                      <td>
                        <StatusBadge status={d.validated ? 'validated' : (d.validation_status ? String(d.validation_status) : 'pending')} />
                      </td>
                      <td className="text-surface-500 text-xs">{formatTime(d.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

