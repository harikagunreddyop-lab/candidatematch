'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ArrowRight, CheckCircle, Loader2, Clock } from 'lucide-react';
import type { AutomationStats } from '@/app/api/automation/stats/route';

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-medium text-surface-400 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-surface-900 mt-1 tabular-nums">{value ?? '—'}</p>
    </div>
  );
}

function PipelineStep({ label, status, time }: { label: string; status: string; time: string }) {
  const icon =
    status === 'success' ? (
      <CheckCircle className="w-5 h-5 text-surface-100" />
    ) : status === 'running' ? (
      <Loader2 className="w-5 h-5 text-surface-200 animate-spin" />
    ) : (
      <Clock className="w-5 h-5 text-surface-500" />
    );
  return (
    <div className="flex flex-col items-center gap-1 min-w-[100px]">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <span className="text-xs text-surface-400">{time}</span>
    </div>
  );
}

function Arrow() {
  return <ArrowRight className="w-5 h-5 text-surface-500 shrink-0" />;
}

export default function AutomationMonitoringPage() {
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [adzunaRunning, setAdzunaRunning] = useState(false);
  const [adzunaMsg, setAdzunaMsg] = useState<string | null>(null);
  const [adzunaWhat, setAdzunaWhat] = useState('data engineer');
  const [adzunaWhere, setAdzunaWhere] = useState('United States');
  const [adzunaPage, setAdzunaPage] = useState(1);
  const [adzunaPages, setAdzunaPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/automation/stats');
        const data = await res.json();
        if (!cancelled) setStats(res.ok ? data : null);
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const runAdzunaIngest = async () => {
    setAdzunaRunning(true);
    setAdzunaMsg(null);
    try {
      const res = await fetch('/api/integrations/adzuna/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          what: adzunaWhat,
          where: adzunaWhere,
          page: adzunaPage,
          results_per_page: 50,
          pages: adzunaPages,
          skip_matching: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Adzuna ingest failed');
      }
      setAdzunaMsg(
        `Ingested ${data.inserted ?? 0} jobs (${data.duplicates ?? 0} duplicates, ${data.skipped ?? 0} skipped)`,
      );
    } catch (err: any) {
      setAdzunaMsg(err?.message || 'Failed to run Adzuna ingest');
    } finally {
      setAdzunaRunning(false);
    }
  };

  const formatLastRun = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const sec = (Date.now() - d.getTime()) / 1000;
    if (sec < 60) return 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/admin"
          className="text-surface-400 hover:text-white flex items-center gap-1 text-sm"
        >
          <ChevronLeft size={18} /> Back
        </Link>
      </div>
      <h1 className="text-3xl font-bold text-surface-900">Automation Pipeline</h1>
      <p className="text-surface-500 text-sm">
        EventBridge-driven ingestion → matching → notification. Monitor runs and health here.
      </p>

      {loading ? (
        <div className="rounded-xl border border-surface-300 bg-white p-8 text-center text-surface-600">
          Loading…
        </div>
      ) : !stats ? (
        <div className="rounded-xl border border-surface-300 bg-white p-8 text-center text-surface-600">
          Failed to load automation stats.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl p-6 border border-surface-300">
            <h2 className="text-xl font-semibold text-surface-900 mb-4">Job Ingestion</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Metric label="Last Run" value={formatLastRun(stats.ingest.lastRun)} />
              <Metric label="Jobs Added" value={stats.ingest.jobsAdded} />
              <Metric label="Success Rate" value={`${stats.ingest.successRate}%`} />
              <Metric label="Next Run" value={stats.ingest.nextRun} />
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-surface-300">
            <h2 className="text-xl font-semibold text-surface-900 mb-4">Auto-Matching</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Metric label="Last Run" value={formatLastRun(stats.matching.lastRun)} />
              <Metric label="Matches Created" value={stats.matching.matchesCreated} />
              <Metric label="High Score (85+)" value={stats.matching.highScoreMatches} />
              <Metric label="Next Run" value={stats.matching.nextRun} />
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-surface-300">
            <h2 className="text-xl font-semibold text-surface-900 mb-4">Pipeline Flow</h2>
            <div className="flex flex-wrap items-center gap-4">
              <PipelineStep
                label="Ingest"
                status={stats.pipeline.ingest.status}
                time={stats.pipeline.ingest.time}
              />
              <Arrow />
              <PipelineStep
                label="Quality Check"
                status={stats.pipeline.qualityCheck.status}
                time={stats.pipeline.qualityCheck.time}
              />
              <Arrow />
              <PipelineStep
                label="Matching"
                status={stats.pipeline.matching.status}
                time={stats.pipeline.matching.time}
              />
              <Arrow />
              <PipelineStep
                label="Notify"
                status={stats.pipeline.notify.status}
                time={stats.pipeline.notify.time}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-surface-300 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-surface-900 mb-1">
                  External Job Ingest (Adzuna)
                </h2>
                <p className="text-sm text-surface-500">
                  Run an on-demand Adzuna search and ingest results into the internal jobs table.
                </p>
              </div>
              <button
                type="button"
                onClick={runAdzunaIngest}
                disabled={adzunaRunning}
                className="inline-flex items-center gap-2 rounded-lg bg-surface-900 text-white text-sm font-medium px-4 py-2 hover:bg-surface-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {adzunaRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    Ingest jobs
                  </>
                )}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-surface-500">
                  Search job titles (comma-separated)
                </label>
                <input
                  type="text"
                  value={adzunaWhat}
                  onChange={(e) => setAdzunaWhat(e.target.value)}
                  className="input text-sm"
                  placeholder="e.g. javascript developer"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-surface-500">
                  Location
                </label>
                <input
                  type="text"
                  value={adzunaWhere}
                  onChange={(e) => setAdzunaWhere(e.target.value)}
                  className="input text-sm"
                  placeholder="e.g. London"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-surface-500">
                  Page
                </label>
                <input
                  type="number"
                  min={1}
                  value={adzunaPage}
                  onChange={(e) => setAdzunaPage(Math.max(1, Number(e.target.value) || 1))}
                  className="input text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-surface-500">
                  Pages to ingest (max 100)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={adzunaPages}
                  onChange={(e) =>
                    setAdzunaPages(
                      Math.min(100, Math.max(1, Number(e.target.value) || 1)),
                    )
                  }
                  className="input text-sm"
                />
              </div>
            </div>
            {adzunaMsg && (
              <div className="text-sm text-surface-700 bg-surface-50 border border-surface-200 rounded-lg px-3 py-2">
                {adzunaMsg}
              </div>
            )}
          </div>

        </>
      )}

      <div className="flex gap-3 flex-wrap">
        <Link
          href="/dashboard/admin/system/cron"
          className="text-sm text-surface-200 hover:text-white"
        >
          Cron history →
        </Link>
        <Link
          href="/dashboard/admin/system/connectors"
          className="text-sm text-surface-200 hover:text-white"
        >
          Connectors →
        </Link>
      </div>
    </div>
  );
}
