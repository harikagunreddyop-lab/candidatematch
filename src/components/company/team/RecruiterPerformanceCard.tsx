'use client';

import { useCallback, useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface RecruiterMetrics {
  recruiter_id: string;
  candidates_contacted: number;
  applications_submitted: number;
  interviews_scheduled: number;
  offers_extended: number;
  hires_completed: number;
  response_rate?: number | null;
  interview_conversion_rate?: number | null;
  avg_time_to_interview_days?: number | null;
  quality_score?: number | null;
}

export interface RecruiterPerformanceCardProps {
  recruiterId: string;
  recruiterName?: string | null;
  period?: 'weekly' | 'monthly' | 'quarterly';
  className?: string;
}

export function RecruiterPerformanceCard({
  recruiterId,
  recruiterName,
  period = 'monthly',
  className,
}: RecruiterPerformanceCardProps) {
  const [metrics, setMetrics] = useState<RecruiterMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/company/team/metrics?recruiter_id=${encodeURIComponent(recruiterId)}&period=${period}`
      );
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      const first = (data.metrics ?? [])[0];
      setMetrics(first ?? null);
    } catch {
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [recruiterId, period]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-surface-200 dark:border-surface-600 p-6 animate-pulse', className)}>
        <div className="h-5 bg-surface-200 dark:bg-surface-600 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-surface-100 dark:bg-surface-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const m = metrics;
  const items = m
    ? [
        { label: 'Contacted', value: m.candidates_contacted },
        { label: 'Applications', value: m.applications_submitted },
        { label: 'Interviews', value: m.interviews_scheduled },
        { label: 'Offers', value: m.offers_extended },
        { label: 'Hires', value: m.hires_completed },
      ]
    : [];

  return (
    <div
      className={cn(
        'rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 overflow-hidden',
        className
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-200 dark:border-surface-600">
        <User size={18} className="text-surface-500" />
        <span className="font-semibold text-surface-800 dark:text-surface-200">
          {recruiterName || 'Recruiter'}
        </span>
        <span className="text-xs text-surface-500 capitalize">· {period}</span>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-surface-500 text-sm">
          No metrics for this period yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-4">
          {items.map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 p-3 text-center"
            >
              <div className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums">
                {value}
              </div>
              <div className="text-xs text-surface-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}
      {m?.quality_score != null && (
        <div className="px-4 py-2 border-t border-surface-200 dark:border-surface-600 text-sm text-surface-600 dark:text-surface-400">
          Quality score: <strong>{m.quality_score}</strong>/100
        </div>
      )}
    </div>
  );
}
