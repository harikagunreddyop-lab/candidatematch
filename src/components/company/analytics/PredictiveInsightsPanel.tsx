'use client';

import { Lightbulb, TrendingUp, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface PredictiveInsight {
  time_to_fill_prediction?: { job_id: string; job_title: string; predicted_days: number; confidence: number }[];
  pipeline_health?: number;
  recommendations?: string[];
}

interface PredictiveInsightsPanelProps {
  data: PredictiveInsight | null;
  loading?: boolean;
  className?: string;
}

export function PredictiveInsightsPanel({ data, loading, className }: PredictiveInsightsPanelProps) {
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
        <div className="h-32 animate-pulse bg-surface-700 rounded-lg" />
      </div>
    );
  }

  const predictions = data?.time_to_fill_prediction ?? [];
  const recommendations = data?.recommendations ?? [];
  const health = data?.pipeline_health ?? 0;

  return (
    <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-amber-400" />
        Predictive Insights
      </h2>
      {health > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-surface-300">Pipeline health: {health}/100</span>
        </div>
      )}
      {predictions.length > 0 && (
        <div className="space-y-2 mb-4">
          <div className="text-xs font-medium text-surface-500 uppercase tracking-wider">Time to fill (predicted)</div>
          <ul className="space-y-1">
            {predictions.slice(0, 5).map((p) => (
              <li key={p.job_id} className="flex justify-between text-sm">
                <span className="text-surface-300 truncate max-w-[180px]">{p.job_title}</span>
                <span className="text-white font-medium">{p.predicted_days} days</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recommendations.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-surface-500 uppercase tracking-wider flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Recommendations
          </div>
          <ul className="space-y-1.5">
            {recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-surface-400 flex gap-2">
                <span className="text-brand-400 shrink-0">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
      {predictions.length === 0 && recommendations.length === 0 && (
        <p className="text-surface-500 text-sm">No insights yet. More hiring data will improve predictions.</p>
      )}
    </div>
  );
}
