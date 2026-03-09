'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { RankedCandidate } from '@/types/pipeline';

export interface AIRankingPanelProps {
  jobId: string;
  jobTitle?: string;
  candidateIds: string[];
  onRanked?: (ranking: RankedCandidate[]) => void;
  className?: string;
}

export function AIRankingPanel({
  jobId,
  jobTitle,
  candidateIds,
  onRanked,
  className,
}: AIRankingPanelProps) {
  const [ranking, setRanking] = useState<RankedCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runRanking = useCallback(async () => {
    if (candidateIds.length === 0) {
      setError('Select at least one candidate');
      return;
    }
    setLoading(true);
    setError(null);
    setRanking(null);
    try {
      const res = await fetch(`/api/company/jobs/${jobId}/rank-candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates: candidateIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ranking failed');
      setRanking(data.ranking ?? []);
      onRanked?.(data.ranking ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rank');
    } finally {
      setLoading(false);
    }
  }, [jobId, candidateIds, onRanked]);

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-600 flex items-center justify-between">
        <h3 className="font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <Sparkles size={18} className="text-brand-500" /> AI candidate ranking
        </h3>
        <button
          type="button"
          onClick={runRanking}
          disabled={loading || candidateIds.length === 0}
          className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          {loading ? 'Ranking…' : `Rank ${candidateIds.length} candidate${candidateIds.length !== 1 ? 's' : ''}`}
        </button>
      </div>
      {jobTitle && (
        <p className="px-4 py-1 text-sm text-surface-500 dark:text-surface-400">Job: {jobTitle}</p>
      )}
      {error && (
        <p className="px-4 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {ranking && ranking.length > 0 && (
        <ul className="divide-y divide-surface-200 dark:divide-surface-600">
          {ranking.map((r, _i) => (
            <li key={r.candidate_id} className="px-4 py-3 flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-500/25 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-sm">
                {r.rank}
              </span>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/dashboard/company/candidates/${r.candidate_id}`}
                  className="font-medium text-surface-900 dark:text-surface-100 hover:text-brand-600 dark:hover:text-brand-400"
                >
                  Candidate {r.candidate_id.slice(0, 8)}…
                </Link>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span
                    className={cn(
                      'text-xs font-semibold px-1.5 py-0.5 rounded',
                      r.score >= 75 && 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
                      r.score >= 50 && r.score < 75 && 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                      r.score < 50 && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    )}
                  >
                    {r.score}
                  </span>
                  <span
                    className={cn(
                      'text-xs capitalize',
                      r.recommendation === 'strong_hire' && 'text-emerald-600 dark:text-emerald-400',
                      r.recommendation === 'maybe' && 'text-amber-600 dark:text-amber-400',
                      r.recommendation === 'pass' && 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {r.recommendation.replace('_', ' ')}
                  </span>
                </div>
                {r.strengths && r.strengths.length > 0 && (
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
                    + {r.strengths.slice(0, 2).join('; ')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
