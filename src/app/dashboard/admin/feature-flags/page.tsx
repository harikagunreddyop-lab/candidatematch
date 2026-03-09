'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface FeatureFlagItem {
  key: string;
  enabled: boolean;
  rolloutPercentage?: number;
  enabledFor?: string[];
  metadata?: Record<string, unknown>;
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/feature-flags');
      if (res.ok) {
        const data = await res.json();
        setFlags(Array.isArray(data) ? data : []);
      } else {
        setFlags([]);
      }
    } catch {
      setFlags([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleFlag(key: string) {
    setToggling(key);
    try {
      await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, action: 'toggle' }),
      });
      await load();
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/admin"
          className="text-surface-600 hover:text-surface-900 flex items-center gap-1 text-sm"
        >
          <ChevronLeft size={18} /> Back to Dashboard
        </Link>
      </div>
      <div>
        <h1 className="admin-page-title">Feature Flags</h1>
        <p className="admin-page-subtitle">Product flags (Redis). Toggle or adjust rollout for gradual releases.</p>
      </div>

      {loading && !flags.length ? (
        <div className="rounded-2xl border border-surface-300 bg-white p-8 text-center text-surface-600">
          Loading…
        </div>
      ) : (
        <div className="space-y-4">
          {flags.length === 0 && !loading ? (
            <div className="rounded-2xl border border-surface-300 bg-white p-8 text-center text-surface-600">
              No feature flags found. Redis may not be configured or flags not initialized.
            </div>
          ) : (
            flags.map((flag) => (
              <div
                key={flag.key}
                className="rounded-xl border border-surface-300 bg-white p-4 shadow-[0_8px_25px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-surface-900">{flag.key}</h3>
                    <p className="text-sm text-surface-600 mt-0.5">
                      Rollout: {flag.rolloutPercentage ?? 100}%
                      {flag.metadata && Object.keys(flag.metadata).length > 0 && (
                        <span className="ml-2 text-surface-500">
                          · {JSON.stringify(flag.metadata)}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFlag(flag.key)}
                    disabled={toggling === flag.key}
                    className={cn(
                      'px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors',
                      flag.enabled
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-slate-500 hover:bg-slate-600'
                    )}
                  >
                    {toggling === flag.key ? '…' : flag.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
