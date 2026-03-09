'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { PipelineHealth as PipelineHealthType } from '@/types/pipeline';

export interface PipelineHealthDashboardProps {
  jobId?: string;
  className?: string;
}

export function PipelineHealthDashboard({ jobId, className }: PipelineHealthDashboardProps) {
  const [health, setHealth] = useState<PipelineHealthType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = jobId
        ? `/api/company/pipeline/health?job_id=${encodeURIComponent(jobId)}`
        : '/api/company/pipeline/health';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load health');
      const data = await res.json();
      setHealth(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className={cn('rounded-xl border border-surface-200 dark:border-surface-700 p-4 text-surface-500 text-sm', className)}>
        {error ?? 'No health data'}
        <button type="button" onClick={() => fetchHealth()} className="ml-2 text-brand-500 hover:underline">Retry</button>
      </div>
    );
  }

  const scoreColor =
    health.overall_score >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : health.overall_score >= 50
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-3">
        <Activity size={20} className="text-surface-500" />
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Pipeline health</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 p-4">
          <p className="text-xs text-surface-500 dark:text-surface-400">Health score</p>
          <p className={cn('text-2xl font-bold mt-0.5', scoreColor)}>{health.overall_score}</p>
          <p className="text-[10px] text-surface-400 mt-0.5">0–100</p>
        </div>
        <div className="rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 p-4">
          <p className="text-xs text-surface-500 dark:text-surface-400">Predicted time to fill</p>
          <p className="text-xl font-semibold text-surface-800 dark:text-surface-200 mt-0.5">
            {health.predicted_time_to_fill_days ?? '—'} days
          </p>
        </div>
        <div className="rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 p-4">
          <p className="text-xs text-surface-500 dark:text-surface-400">At-risk applications</p>
          <p className="text-xl font-semibold text-surface-800 dark:text-surface-200 mt-0.5">
            {health.at_risk_applications?.length ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 p-4">
          <p className="text-xs text-surface-500 dark:text-surface-400">Stages</p>
          <p className="text-xl font-semibold text-surface-800 dark:text-surface-200 mt-0.5">
            {health.stage_analysis?.length ?? 0}
          </p>
        </div>
      </div>

      {health.stage_analysis && health.stage_analysis.length > 0 && (
        <div className="rounded-xl border border-surface-200 dark:border-surface-600 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-100 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-600">
                <th className="text-left py-2 px-3 font-semibold text-surface-700 dark:text-surface-200">Stage</th>
                <th className="text-left py-2 px-3 font-semibold text-surface-700 dark:text-surface-200">Avg. time</th>
                <th className="text-left py-2 px-3 font-semibold text-surface-700 dark:text-surface-200">Conversion</th>
                <th className="text-left py-2 px-3 font-semibold text-surface-700 dark:text-surface-200">Status</th>
              </tr>
            </thead>
            <tbody>
              {health.stage_analysis.map((s) => (
                <tr key={s.stage_id} className="border-b border-surface-100 dark:border-surface-700/50 last:border-0">
                  <td className="py-2 px-3 font-medium text-surface-800 dark:text-surface-200">{s.stage_name}</td>
                  <td className="py-2 px-3 text-surface-600 dark:text-surface-400">{s.avg_time_in_stage_days} days</td>
                  <td className="py-2 px-3 text-surface-600 dark:text-surface-400">{s.conversion_rate}%</td>
                  <td className="py-2 px-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
                        s.bottleneck_severity === 'critical' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                        s.bottleneck_severity === 'major' && 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                        s.bottleneck_severity === 'minor' && 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300',
                        s.bottleneck_severity === 'none' && 'bg-surface-100 dark:bg-surface-700/50 text-surface-600 dark:text-surface-400'
                      )}
                    >
                      {s.bottleneck_severity === 'critical' && <AlertTriangle size={12} />}
                      {s.bottleneck_severity === 'major' && <Clock size={12} />}
                      {s.bottleneck_severity === 'none' && <TrendingUp size={12} />}
                      {s.bottleneck_severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {health.at_risk_applications && health.at_risk_applications.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle size={16} /> At-risk applications
          </h4>
          <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
            {health.at_risk_applications.slice(0, 5).map((a) => (
              <li key={a.application_id}>
                <strong>{a.candidate_name}</strong> – {a.job_title}: {a.issue}
              </li>
            ))}
            {health.at_risk_applications.length > 5 && (
              <li className="text-amber-600 dark:text-amber-400">+{health.at_risk_applications.length - 5} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
