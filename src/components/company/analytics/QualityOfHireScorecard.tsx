'use client';

import { Star } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface QualityOfHireScorecardProps {
  averageScore: number | null;
  totalEvaluations: number;
  loading?: boolean;
  className?: string;
}

export function QualityOfHireScorecard({
  averageScore,
  totalEvaluations,
  loading,
  className,
}: QualityOfHireScorecardProps) {
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
        <div className="h-24 animate-pulse bg-surface-700 rounded-lg" />
      </div>
    );
  }

  const score = averageScore != null ? Math.round(averageScore) : null;
  const band = score != null ? (score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low') : null;

  return (
    <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Star className="w-5 h-5 text-amber-400" />
        Quality of Hire
      </h2>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold',
            band === 'high' && 'bg-emerald-500/20 text-emerald-400',
            band === 'mid' && 'bg-amber-500/20 text-amber-400',
            band === 'low' && 'bg-rose-500/20 text-rose-400',
            !band && 'bg-surface-700 text-surface-500'
          )}
        >
          {score ?? '—'}
        </div>
        <div>
          <div className="text-sm text-surface-400">Composite score (0–100)</div>
          <div className="text-surface-500 text-sm mt-0.5">{totalEvaluations} evaluation{totalEvaluations !== 1 ? 's' : ''}</div>
        </div>
      </div>
    </div>
  );
}
