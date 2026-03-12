'use client';

import { cn } from '@/utils/helpers';
import type { ATSScoreResult } from '@/lib/ats';

function getScoreColor(val: number): 'lime' | 'amber' | 'red' {
  if (val >= 80) return 'lime';
  if (val >= 50) return 'amber';
  return 'red';
}

function ScoreFactor({ label, value }: { label: string; value: number }) {
  const color = getScoreColor(value);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-surface-400 dark:text-surface-500 w-[180px] shrink-0 truncate">
        {label}
      </span>
      <div className="flex-1 h-2 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            color === 'lime' && 'bg-[#b8eb1a]',
            color === 'amber' && 'bg-amber-500',
            color === 'red' && 'bg-red-500'
          )}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <span className="text-sm font-medium text-surface-800 dark:text-surface-200 w-8 shrink-0 tabular-nums">
        {value}
      </span>
    </div>
  );
}

type Props = {
  score: ATSScoreResult;
  className?: string;
};

export function ATSScoreCard({ score, className }: Props) {
  const color = getScoreColor(score.total_score);
  const passLabel =
    score.band === 'elite'
      ? 'Excellent'
      : score.band === 'strong'
        ? 'Good'
        : 'Needs Work';

  return (
    <div
      className={cn(
        'rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50/80 dark:bg-surface-800/80 p-6 space-y-6',
        className
      )}
    >
      {/* Overall Score */}
      <div className="text-center">
        <div className="relative inline-flex items-center justify-center w-32 h-32 mb-4">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-surface-200 dark:text-surface-600"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={`${score.total_score * 3.52} 352`}
              className={cn(
                color === 'lime' && 'text-[#b8eb1a]',
                color === 'amber' && 'text-amber-500',
                color === 'red' && 'text-red-500'
              )}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-surface-900 dark:text-white">
              {score.total_score}
            </span>
          </div>
        </div>
        <h3 className="text-xl font-semibold text-surface-900 dark:text-white mb-1">
          ATS Score
        </h3>
        <p
          className={cn(
            'text-sm',
            color === 'lime' && 'text-[#b8eb1a]',
            color === 'amber' && 'text-amber-600 dark:text-amber-400',
            color === 'red' && 'text-red-600 dark:text-red-400'
          )}
        >
          {passLabel}
        </p>
      </div>

      {/* Factor Breakdown */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
          Score breakdown
        </h4>
        <ScoreFactor
          label="Keyword coverage"
          value={score.dimensions.keyword_coverage.score}
        />
        <ScoreFactor
          label="Parse integrity"
          value={score.dimensions.parse_integrity.score}
        />
        <ScoreFactor
          label="Experience match"
          value={score.dimensions.experience_match.score}
        />
        <ScoreFactor
          label="Section completeness"
          value={score.dimensions.section_completeness.score}
        />
        <ScoreFactor
          label="Keyword placement"
          value={score.dimensions.keyword_placement.score}
        />
        <ScoreFactor
          label="Formatting details"
          value={score.dimensions.formatting_details.score}
        />
      </div>

      {/* Quick Wins */}
      {score.fix_priorities.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-3">
            Quick wins
          </h4>
          <ul className="space-y-2">
            {score.fix_priorities.slice(0, 3).map((tip, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-surface-600 dark:text-surface-400"
              >
                <span className="text-brand-400 shrink-0">•</span>
                <span>{tip.issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Keyword Analysis */}
      <div>
        <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-3">
          Keyword analysis
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-surface-500 dark:text-surface-400">Density</span>
            <span className="text-surface-900 dark:text-white font-semibold">
              {score.keyword_analysis.density_score.toFixed(0)} / 100
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {score.keyword_analysis.matched_exact.map((kw) => (
              <span
                key={kw}
                className="px-2 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs"
              >
                {kw}
              </span>
            ))}
            {score.keyword_analysis.missing_must_have.map((kw) => (
              <span
                key={kw}
                className="px-2 py-1 bg-red-500/10 text-red-600 dark:text-red-400 rounded text-xs"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
