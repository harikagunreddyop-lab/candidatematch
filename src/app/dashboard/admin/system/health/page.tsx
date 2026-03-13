'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Database, Zap, Cloud, RefreshCw, ChevronLeft, Bot } from 'lucide-react';

type CheckValue = string | { status: string; error?: string };

function checkStatus(c: CheckValue | undefined): string {
  if (c == null) return '—';
  if (typeof c === 'object' && 'status' in c) return c.error ? `${c.status}: ${c.error}` : c.status;
  return String(c);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/admin" className="text-surface-600 hover:text-surface-900 flex items-center gap-1 text-sm">
          <ChevronLeft size={18} /> Back to Dashboard
        </Link>
        <button onClick={load} disabled={loading} className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      <div>
        <h1 className="admin-page-title">System Health</h1>
        <p className="admin-page-subtitle">Database, Redis, cache, and model provider status.</p>
      </div>

      {loading && !health ? (
        <div className="rounded-2xl border border-surface-300 bg-white p-8 text-center text-surface-600">
          Loading…
        </div>
      ) : (
        <div className="rounded-2xl border border-surface-300 bg-white overflow-hidden shadow-[0_8px_25px_rgba(15,23,42,0.05)]">
          <div className="px-6 py-4 border-b border-surface-300 flex items-center justify-between">
            <span className="font-semibold text-surface-900">Overall</span>
            <span className="text-sm font-medium px-2 py-0.5 rounded-full bg-surface-900 text-surface-50">
              {health?.status ?? 'unknown'}
            </span>
          </div>
          <div className="p-6 space-y-4">
            {health?.checks && (
              <>
                <div className="flex items-center gap-3">
                  <Database size={20} className="text-surface-500" />
                  <span className="flex-1 text-surface-900">Database</span>
                  <span className="font-medium text-surface-800">{checkStatus(health.checks.database)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Zap size={20} className="text-surface-500" />
                  <span className="flex-1 text-surface-900">Redis (queues)</span>
                  <span className="font-medium text-surface-800">{checkStatus(health.checks.redis)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Cloud size={20} className="text-surface-500" />
                  <span className="flex-1 text-surface-900">Cache (Upstash)</span>
                  <span className="font-medium text-surface-800">{checkStatus(health.checks.cache)}</span>
                </div>
                {health.checks.anthropic !== undefined && (
                  <div className="flex items-center gap-3">
                    <Bot size={20} className="text-surface-500" />
                    <span className="flex-1 text-surface-900">Anthropic</span>
                    <span className="font-medium text-surface-800">{checkStatus(health.checks.anthropic)}</span>
                  </div>
                )}
              </>
            )}
          </div>
          {health?.timestamp && (
            <div className="px-6 py-2 border-t border-surface-300 text-xs text-surface-600">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
