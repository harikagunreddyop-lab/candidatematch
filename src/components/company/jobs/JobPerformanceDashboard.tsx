'use client';

import { useState, useEffect } from 'react';
import { BarChart2, Users, Eye, Clock } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface JobPerformanceDashboardProps {
  jobId: string;
  className?: string;
}

export function JobPerformanceDashboard({ jobId, className }: JobPerformanceDashboardProps) {
  const [data, setData] = useState<{
    job_title: string;
    days_open: number;
    total_views: number;
    total_applications: number;
    qualified_applications: number;
    interviews_scheduled: number;
    offers_made: number;
    conversion_rate: number | null;
    quality_score: number | null;
    time_to_first_application_hours: number | null;
    conversion_funnel: { views: number; applications: number; qualified: number; interview: number; offer: number };
    source_breakdown: { source: string; applications: number; views: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/company/jobs/${jobId}/performance`)
      .then((r) => r.json())
      .then((d) => !d.error && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-surface-700 bg-surface-800/50 p-6', className)}>
        <div className="h-48 animate-pulse bg-surface-700 rounded-lg" />
      </div>
    );
  }
  if (!data) return null;

  const { conversion_funnel, source_breakdown } = data;

  return (
    <div className={cn('rounded-2xl border border-surface-700 bg-surface-800/50 p-6', className)}>
      <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
        <BarChart2 className="w-5 h-5 text-brand-400" />
        Job performance
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="rounded-lg bg-surface-900/50 p-3">
          <div className="flex items-center gap-1.5 text-surface-500 text-xs mb-0.5">
            <Eye className="w-3.5 h-3.5" /> Views
          </div>
          <div className="text-xl font-bold text-white">{data.total_views}</div>
        </div>
        <div className="rounded-lg bg-surface-900/50 p-3">
          <div className="flex items-center gap-1.5 text-surface-500 text-xs mb-0.5">
            <Users className="w-3.5 h-3.5" /> Applications
          </div>
          <div className="text-xl font-bold text-white">{data.total_applications}</div>
        </div>
        <div className="rounded-lg bg-surface-900/50 p-3">
          <div className="text-surface-500 text-xs mb-0.5">Interviews</div>
          <div className="text-xl font-bold text-white">{data.interviews_scheduled}</div>
        </div>
        <div className="rounded-lg bg-surface-900/50 p-3">
          <div className="flex items-center gap-1.5 text-surface-500 text-xs mb-0.5">
            <Clock className="w-3.5 h-3.5" /> Days open
          </div>
          <div className="text-xl font-bold text-white">{data.days_open}</div>
        </div>
      </div>
      {data.conversion_rate != null && (
        <p className="text-sm text-surface-400 mb-2">
          View → application rate: <span className="text-white font-medium">{data.conversion_rate.toFixed(1)}%</span>
        </p>
      )}
      {data.time_to_first_application_hours != null && (
        <p className="text-sm text-surface-400 mb-2">
          Time to first application: <span className="text-white font-medium">{data.time_to_first_application_hours}h</span>
        </p>
      )}
      {source_breakdown.length > 0 && (
        <div className="pt-3 border-t border-surface-700">
          <p className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-2">By source</p>
          <ul className="space-y-1 text-sm">
            {source_breakdown.map((s) => (
              <li key={s.source} className="flex justify-between text-surface-400">
                <span>{s.source}</span>
                <span className="text-white">{s.applications} applications</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="pt-3 mt-3 border-t border-surface-700 flex gap-2 flex-wrap">
        <span className="text-xs text-surface-500">Funnel:</span>
        <span className="text-xs text-surface-400">Views {conversion_funnel.views}</span>
        <span className="text-xs text-surface-500">→</span>
        <span className="text-xs text-surface-400">Applied {conversion_funnel.applications}</span>
        <span className="text-xs text-surface-500">→</span>
        <span className="text-xs text-surface-400">Interview {conversion_funnel.interview}</span>
        <span className="text-xs text-surface-500">→</span>
        <span className="text-xs text-surface-400">Offer {conversion_funnel.offer}</span>
      </div>
    </div>
  );
}
