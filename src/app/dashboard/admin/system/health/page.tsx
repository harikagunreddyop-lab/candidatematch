'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Database, Zap, Cloud, RefreshCw, ChevronLeft } from 'lucide-react';
import { cn } from '@/utils/helpers';

export default function SystemHealthPage() {
  const [health, setHealth] = useState<{ status: string; checks?: Record<string, string>; timestamp?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ status: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/admin" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
          <ChevronLeft size={18} /> Back to Dashboard
        </Link>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-sm font-medium disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      <h1 className="text-2xl font-bold text-white">System Health</h1>
      <p className="text-surface-400 text-sm">Database, Redis, and cache status.</p>

      {loading && !health ? (
        <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-8 text-center text-surface-500">
          Loading…
        </div>
      ) : (
        <div className="rounded-2xl border border-surface-700 bg-surface-800/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-700 flex items-center justify-between">
            <span className="font-semibold text-white">Overall</span>
            <span className={cn(
              'text-sm font-medium px-2 py-0.5 rounded-full',
              health?.status === 'healthy' && 'bg-emerald-500/20 text-emerald-400',
              health?.status === 'degraded' && 'bg-amber-500/20 text-amber-400',
              (health?.status === 'unhealthy' || health?.status === 'error') && 'bg-red-500/20 text-red-400'
            )}>
              {health?.status ?? 'unknown'}
            </span>
          </div>
          <div className="p-6 space-y-4">
            {health?.checks && (
              <>
                <div className="flex items-center gap-3">
                  <Database size={20} className="text-surface-500" />
                  <span className="flex-1">Database</span>
                  <span className={cn(
                    'font-medium',
                    health.checks.database === 'healthy' ? 'text-emerald-400' : 'text-red-400'
                  )}>{health.checks.database ?? '—'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Zap size={20} className="text-surface-500" />
                  <span className="flex-1">Redis (queues)</span>
                  <span className={cn(
                    'font-medium',
                    health.checks.redis === 'healthy' ? 'text-emerald-400' : health.checks.redis === 'not_configured' ? 'text-surface-400' : 'text-amber-400'
                  )}>{health.checks.redis ?? '—'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Cloud size={20} className="text-surface-500" />
                  <span className="flex-1">Cache (Upstash)</span>
                  <span className={cn(
                    'font-medium',
                    health.checks.cache === 'healthy' ? 'text-emerald-400' : health.checks.cache === 'not_configured' ? 'text-surface-400' : 'text-amber-400'
                  )}>{health.checks.cache ?? '—'}</span>
                </div>
              </>
            )}
          </div>
          {health?.timestamp && (
            <div className="px-6 py-2 border-t border-surface-700 text-xs text-surface-500">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
