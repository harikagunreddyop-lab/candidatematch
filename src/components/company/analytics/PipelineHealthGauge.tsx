'use client';

import { cn } from '@/utils/helpers';

interface PipelineHealthGaugeProps {
  score: number;
  label?: string;
  loading?: boolean;
  className?: string;
}

export function PipelineHealthGauge({ score, label = 'Pipeline health', loading, className }: PipelineHealthGaugeProps) {
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
        <div className="h-24 animate-pulse bg-surface-700 rounded-lg" />
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, score));
  const band = pct >= 60 ? 'high' : pct >= 30 ? 'mid' : 'low';

  return (
    <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
      <h2 className="text-lg font-semibold text-white mb-4">{label}</h2>
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#334155"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke={band === 'high' ? '#22c55e' : band === 'mid' ? '#f59e0b' : '#ef4444'}
              strokeWidth="3"
              strokeDasharray={`${pct}, 100`}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white">{pct}</span>
        </div>
        <div className="text-sm text-surface-400">Score 0–100. Higher is better conversion to interview.</div>
      </div>
    </div>
  );
}
