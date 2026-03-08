'use client';

import { cn } from '@/utils/helpers';
import { TrendingUp } from 'lucide-react';

type Props = {
  atsScore: number;
  fitScore?: number;
  appliedCount?: number;
  className?: string;
};

export function SuccessPredictor({ atsScore, fitScore = 0, appliedCount = 0, className }: Props) {
  const base = atsScore >= 80 ? 0.75 : atsScore >= 60 ? 0.5 : 0.25;
  const fitBonus = Math.min(0.15, (fitScore - 70) / 100);
  const volumeBonus = Math.min(0.1, appliedCount * 0.02);
  const p = Math.round((base + fitBonus + volumeBonus) * 100);

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-4', className)}>
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-semibold text-surface-900 dark:text-white">Success likelihood</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-violet-600 dark:text-violet-400">{p}%</span>
        <span className="text-xs text-surface-500 dark:text-surface-400">estimated chance of moving forward</span>
      </div>
      <p className="text-xs text-surface-500 dark:text-surface-400 mt-2">
        Based on ATS score ({atsScore}), fit, and application volume.
      </p>
    </div>
  );
}
