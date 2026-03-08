'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Database, Zap, Cloud, RefreshCw, ChevronLeft, Bot } from 'lucide-react';
import { cn } from '@/utils/helpers';

type CheckValue = string | { status: string; error?: string };

function checkStatus(c: CheckValue | undefined): string {
  if (c == null) return '—';
  if (typeof c === 'object' && 'status' in c) return c.error ? `${c.status}: ${c.error}` : c.status;
  return String(c);
}

function isHealthy(c: CheckValue | undefined): boolean {
  if (c == null) return false;
  if (typeof c === 'object' && 'status' in c) return c.status === 'healthy';
  return c === 'healthy';
}

function isNotConfigured(c: CheckValue | undefined): boolean {
  if (c == null) return false;
  if (typeof c === 'object' && 'status' in c) return false;
  return c === 'not_configured';
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<{ status: string; checks?: Record<string, CheckValue>; timestamp?: string } | null>(null);
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
        <Link href="/dashboard/admin" className="text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white flex items-center gap-1 text-sm">
          <ChevronLeft size={18} /> Back to Dashboard
        </Link>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-900 dark:text-white text-sm font-medium disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      <h1 className="text-2xl font-bold text-surface-900 dark:text-white">System Health</h1>
      <p className="text-surface-600 dark:text-surface-400 text-sm">Database, Redis, and cache status.</p>

      {loading && !health ? (
        <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-8 text-center text-surface-600 dark:text-surface-500">
          Loading…
        </div>
      ) : (
        <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200 dark:border-surface-700 flex items-center justify-between">
            <span className="font-semibold text-surface-900 dark:text-white">Overall</span>
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
                  <span className="flex-1 text-surface-900 dark:text-surface-100">Database</span>
                  <span className={cn(
                    'font-medium',
                    isHealthy(health.checks.database) && 'text-emerald-600 dark:text-emerald-400',
                    !isHealthy(health.checks.database) && !isNotConfigured(health.checks.database) && 'text-red-600 dark:text-red-400'
                  )}>{checkStatus(health.checks.database)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Zap size={20} className="text-surface-500" />
                  <span className="flex-1 text-surface-900 dark:text-surface-100">Redis (queues)</span>
                  <span className={cn(
                    'font-medium',
                    isHealthy(health.checks.redis) && 'text-emerald-600 dark:text-emerald-400',
                    isNotConfigured(health.checks.redis) && 'text-surface-600 dark:text-surface-400',
                    !isHealthy(health.checks.redis) && !isNotConfigured(health.checks.redis) && 'text-amber-600 dark:text-amber-400'
                  )}>{checkStatus(health.checks.redis)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Cloud size={20} className="text-surface-500" />
                  <span className="flex-1 text-surface-900 dark:text-surface-100">Cache (Upstash)</span>
                  <span className={cn(
                    'font-medium',
                    isHealthy(health.checks.cache) && 'text-emerald-600 dark:text-emerald-400',
                    isNotConfigured(health.checks.cache) && 'text-surface-600 dark:text-surface-400',
                    !isHealthy(health.checks.cache) && !isNotConfigured(health.checks.cache) && 'text-amber-600 dark:text-amber-400'
                  )}>{checkStatus(health.checks.cache)}</span>
                </div>
                {health.checks.anthropic !== undefined && (
                  <div className="flex items-center gap-3">
                    <Bot size={20} className="text-surface-500" />
                    <span className="flex-1 text-surface-900 dark:text-surface-100">Anthropic</span>
                    <span className={cn(
                      'font-medium',
                      isHealthy(health.checks.anthropic) && 'text-emerald-600 dark:text-emerald-400',
                      isNotConfigured(health.checks.anthropic) && 'text-surface-600 dark:text-surface-400',
                      !isHealthy(health.checks.anthropic) && !isNotConfigured(health.checks.anthropic) && 'text-amber-600 dark:text-amber-400'
                    )}>{checkStatus(health.checks.anthropic)}</span>
                  </div>
                )}
              </>
            )}
          </div>
          {health?.timestamp && (
            <div className="px-6 py-2 border-t border-surface-200 dark:border-surface-700 text-xs text-surface-600 dark:text-surface-500">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
