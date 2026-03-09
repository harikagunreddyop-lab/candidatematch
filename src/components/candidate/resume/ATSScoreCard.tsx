'use client';

import { BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/utils/helpers';

export interface ATSScoreCardProps {
  score: number;
  breakdown?: {
    keywords?: { score: number; matched: string[]; missing: string[] };
    formatting?: { score: number; issues: string[] };
    content?: { score: number; suggestions: string[] };
    readability?: { score: number; metrics?: { wordCount: number; bulletCount: number; sectionCount: number } };
  };
  recommendations?: string[];
  title?: string;
  className?: string;
}

export function ATSScoreCard({
  score,
  breakdown,
  recommendations = [],
  title = 'ATS compatibility',
  className,
}: ATSScoreCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        'rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 overflow-hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-100/50 dark:hover:bg-surface-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-surface-500 dark:text-surface-400" />
          <span className="text-sm font-medium text-surface-700 dark:text-surface-200">{title}</span>
        </div>
        <span
          className={cn(
            'text-lg font-bold tabular-nums px-2 py-0.5 rounded',
            score >= 80
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : score >= 60
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-red-500/15 text-red-600 dark:text-red-400'
          )}
          title="0–100: higher is better for ATS"
        >
          {score}
        </span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-surface-100 dark:border-surface-700 space-y-4">
          {breakdown?.keywords && (
            <div>
              <p className="text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {(breakdown.keywords.matched || []).slice(0, 12).map((k, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200">
                    ✓ {k}
                  </span>
                ))}
                {(breakdown.keywords.missing || []).slice(0, 8).map((k, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200">
                    + {k}
                  </span>
                ))}
              </div>
            </div>
          )}
          {breakdown?.formatting?.issues?.length ? (
            <div>
              <p className="text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Formatting</p>
              <ul className="text-xs text-surface-600 dark:text-surface-300 list-disc list-inside space-y-0.5">
                {breakdown.formatting.issues.slice(0, 5).map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Recommendations</p>
              <ul className="text-xs text-surface-600 dark:text-surface-300 list-disc list-inside space-y-0.5">
                {recommendations.slice(0, 6).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
