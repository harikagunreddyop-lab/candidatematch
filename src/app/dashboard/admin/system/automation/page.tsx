'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ArrowRight, CheckCircle, Loader2, Clock } from 'lucide-react';
import type { AutomationStats } from '@/app/api/automation/stats/route';

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-medium text-surface-400 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-white mt-1 tabular-nums">{value ?? '—'}</p>
    </div>
  );
}

function PipelineStep({ label, status, time }: { label: string; status: string; time: string }) {
  const icon =
    status === 'success' ? (
      <CheckCircle className="w-5 h-5 text-emerald-400" />
    ) : status === 'running' ? (
      <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
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
      <h1 className="text-3xl font-bold text-white">Automation Pipeline</h1>
      <p className="text-surface-400 text-sm">
        EventBridge-driven ingestion → matching → notification. Monitor runs and health here.
      </p>

      {loading ? (
        <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-8 text-center text-surface-500">
          Loading…
        </div>
      ) : !stats ? (
        <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-8 text-center text-surface-500">
          Failed to load automation stats.
        </div>
      ) : (
        <>
          <div className="bg-surface-800 rounded-xl p-6 border border-surface-700">
            <h2 className="text-xl font-semibold text-white mb-4">Job Ingestion</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Metric label="Last Run" value={formatLastRun(stats.ingest.lastRun)} />
              <Metric label="Jobs Added" value={stats.ingest.jobsAdded} />
              <Metric label="Success Rate" value={`${stats.ingest.successRate}%`} />
              <Metric label="Next Run" value={stats.ingest.nextRun} />
            </div>
          </div>

          <div className="bg-surface-800 rounded-xl p-6 border border-surface-700">
            <h2 className="text-xl font-semibold text-white mb-4">Auto-Matching</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Metric label="Last Run" value={formatLastRun(stats.matching.lastRun)} />
              <Metric label="Matches Created" value={stats.matching.matchesCreated} />
              <Metric label="High Score (85+)" value={stats.matching.highScoreMatches} />
              <Metric label="Next Run" value={stats.matching.nextRun} />
            </div>
          </div>

          <div className="bg-surface-800 rounded-xl p-6 border border-surface-700">
            <h2 className="text-xl font-semibold text-white mb-4">Pipeline Flow</h2>
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
        </>
      )}

      <div className="flex gap-3 flex-wrap">
        <Link
          href="/dashboard/admin/system/cron"
          className="text-sm text-brand-400 hover:text-brand-300"
        >
          Cron history →
        </Link>
        <Link
          href="/dashboard/admin/system/connectors"
          className="text-sm text-brand-400 hover:text-brand-300"
        >
          Connectors →
        </Link>
      </div>
    </div>
  );
}
