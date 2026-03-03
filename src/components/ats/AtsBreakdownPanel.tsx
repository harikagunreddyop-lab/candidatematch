'use client';

/**
 * ATS Score Breakdown Panel — Clear explanation of score, what's missing, and why.
 * Access-controlled by parent: candidate_see_ats_fix_report for candidates; recruiters/admins always see.
 */

import { ChevronDown, ChevronUp, BarChart2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/utils/helpers';

const DIMENSION_LABELS: Record<string, string> = {
  keyword: 'Skills & keywords',
  experience: 'Years of experience',
  title: 'Role / title alignment',
  education: 'Education',
  location: 'Location & visa',
  formatting: 'Resume formatting',
  behavioral: 'Behavioral signals',
  soft: 'Nuanced fit',
};

type DimensionScore = { score: number; details: string; matched?: string[]; missing?: string[] };

type AtsBreakdown = {
  dimensions?: Record<string, DimensionScore>;
  matched_keywords?: string[];
  missing_keywords?: string[];
};

type Props = {
  atsScore: number;
  atsReason?: string | null;
  atsBreakdown?: AtsBreakdown | null;
  matchedKeywords?: string[];
  missingKeywords?: string[];
  /** Whether the user has access to see this (admin-controlled) */
  visible?: boolean;
  className?: string;
  compact?: boolean;
};

export function AtsBreakdownPanel({
  atsScore,
  atsReason,
  atsBreakdown,
  matchedKeywords = [],
  missingKeywords = [],
  visible = true,
  className,
  compact = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!visible) return null;
  if (typeof atsScore !== 'number') return null;

  const dims = atsBreakdown?.dimensions || {};
  // matched_keywords / missing_keywords: from match object (props) or keyword dimension in breakdown
  const kwDim = dims.keyword as DimensionScore | undefined;
  const missingKw = (missingKeywords.length > 0 ? missingKeywords : (kwDim?.missing ?? [])) as string[];
  const matchedKw = (matchedKeywords.length > 0 ? matchedKeywords : (kwDim?.matched ?? [])) as string[];

  const dimEntries = Object.entries(dims).filter(
    ([k, v]) => v && typeof (v as DimensionScore).score === 'number'
  ) as [string, DimensionScore][];

  const weakest = dimEntries
    .sort(([, a], [, b]) => (a as DimensionScore).score - (b as DimensionScore).score)
    .slice(0, 3);
  const isLowScore = atsScore < 75;

  return (
    <div
      className={cn(
        'rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50/50 dark:bg-surface-800/50 overflow-hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-100/50 dark:hover:bg-surface-700/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <BarChart2 size={16} className="shrink-0 text-surface-500 dark:text-surface-400" />
          <span className="text-sm font-medium text-surface-700 dark:text-surface-200">
            ATS score breakdown
          </span>
          <span
            className={cn(
              'text-sm font-semibold px-1.5 py-0.5 rounded',
              atsScore >= 75
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : atsScore >= 50
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'bg-red-500/15 text-red-600 dark:text-red-400'
            )}
          >
            {atsScore}
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="shrink-0 text-surface-400" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-surface-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-surface-100 dark:border-surface-700">
          {atsReason && (
            <p className="text-sm text-surface-600 dark:text-surface-300">{atsReason}</p>
          )}

          {/* What's missing — clear callout */}
          {isLowScore && missingKw.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 px-3 py-2.5">
              <p className="text-xs font-semibold text-red-800 dark:text-red-200 mb-1.5">
                What&apos;s missing
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mb-1.5">
                Add these required skills or keywords to your resume to improve your score:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingKw.map((k: string, i: number) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Why your score is lower */}
          {isLowScore && weakest.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1.5">
                Why your score is lower
              </p>
              <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                {weakest.map(([key, d]) => (
                  <li key={key}>
                    <span className="font-medium">{DIMENSION_LABELS[key] || key}:</span>{' '}
                    {d.details} (score: {d.score})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Matched keywords — positive reinforcement */}
          {matchedKw.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">
                Matched keywords
              </p>
              <div className="flex flex-wrap gap-1">
                {matchedKw.slice(0, 10).map((k: string, i: number) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 rounded text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                  >
                    ✓ {k}
                  </span>
                ))}
                {matchedKw.length > 10 && (
                  <span className="text-xs text-surface-500">+{matchedKw.length - 10} more</span>
                )}
              </div>
            </div>
          )}

          {/* Full dimension breakdown */}
          {!compact && dimEntries.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-surface-600 dark:text-surface-400 mb-2">
                Score by category
              </p>
              <div className="space-y-2">
                {dimEntries.map(([key, d]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-surface-600 dark:text-surface-400 w-[140px] shrink-0">
                      {DIMENSION_LABELS[key] || key}
                    </span>
                    <div className="flex-1 h-1.5 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          d.score >= 75
                            ? 'bg-emerald-500'
                            : d.score >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        )}
                        style={{ width: `${d.score}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-surface-700 dark:text-surface-300 w-8 shrink-0">
                      {d.score}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-2">
                Each category contributes to your overall ATS score. Improve weaker areas to raise your total.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
