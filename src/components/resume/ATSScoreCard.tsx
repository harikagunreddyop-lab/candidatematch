'use client';

/**
 * Real-time ATS score card — multi-factor breakdown, keyword analysis, quick wins.
 * Use with the enhanced LLM-based ATSScore from src/lib/ats/scorer.
 */

import { cn } from '@/utils/helpers';
import type { ATSScore, ATSScores } from '@/lib/ats/scorer';

const FACTOR_LABELS: Record<keyof ATSScores, string> = {
  formatting: 'Formatting',
  keyword_match: 'Keyword match',
  experience: 'Experience relevance',
  skills: 'Skills match',
  education: 'Education',
  achievements: 'Achievement quantification',
};

function getScoreColor(val: number): 'emerald' | 'amber' | 'red' {
  if (val >= 80) return 'emerald';
  if (val >= 60) return 'amber';
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
            color === 'emerald' && 'bg-emerald-500',
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
  score: ATSScore;
  className?: string;
};

export function ATSScoreCard({ score, className }: Props) {
  const color = getScoreColor(score.overall_score);
  const passLabel =
    score.ats_pass_probability > 0.8
      ? 'Excellent'
      : score.ats_pass_probability > 0.6
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
              strokeDasharray={`${score.overall_score * 3.52} 352`}
              className={cn(
                color === 'emerald' && 'text-emerald-500',
                color === 'amber' && 'text-amber-500',
                color === 'red' && 'text-red-500'
              )}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-surface-900 dark:text-white">
              {score.overall_score}
            </span>
          </div>
        </div>
        <h3 className="text-xl font-semibold text-surface-900 dark:text-white mb-1">
          ATS Score
        </h3>
        <p
          className={cn(
            'text-sm',
            color === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
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
        {(Object.entries(score.scores) as [keyof ATSScores, number][]).map(([factor, value]) => (
          <ScoreFactor
            key={factor}
            label={FACTOR_LABELS[factor] ?? factor}
            value={value}
          />
        ))}
      </div>

      {/* Quick Wins */}
      {score.improvements.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-3">
            Quick wins
          </h4>
          <ul className="space-y-2">
            {score.improvements.slice(0, 3).map((tip, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-surface-600 dark:text-surface-400"
              >
                <span className="text-violet-500 dark:text-violet-400 shrink-0">•</span>
                <span>{tip}</span>
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
              {(score.keywords.density * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {score.keywords.found.map((kw) => (
              <span
                key={kw}
                className="px-2 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs"
              >
                {kw}
              </span>
            ))}
            {score.keywords.missing.map((kw) => (
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
