'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface LeaderboardEntry {
  rank: number;
  recruiter_id: string;
  recruiter: { id: string; name: string | null; email: string | null };
  score: number;
  metrics: { hires: number; offers: number; interviews: number; applications: number };
  badges: string[];
}

export interface TeamLeaderboardProps {
  period?: 'weekly' | 'monthly';
  className?: string;
}

export function TeamLeaderboard({ period = 'monthly', className }: TeamLeaderboardProps) {
  const [data, setData] = useState<{ rankings: LeaderboardEntry[]; period: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'weekly' | 'monthly'>(period);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/company/team/leaderboard?period=${selectedPeriod}`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setData({ rankings: json.rankings ?? [], period: json.period });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-surface-600">
        <h3 className="font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <Trophy size={18} className="text-amber-500" /> Leaderboard
        </h3>
        <div className="flex gap-1">
          {(['weekly', 'monthly'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSelectedPeriod(p)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium',
                selectedPeriod === p
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-300 dark:hover:bg-surface-600'
              )}
            >
              {p === 'weekly' ? 'This week' : 'This month'}
            </button>
          ))}
        </div>
      </div>
      {!data || data.rankings.length === 0 ? (
        <div className="p-8 text-center text-surface-500 text-sm">
          No metrics yet. Activity will show here once recruiters have data for this period.
        </div>
      ) : (
        <ul className="divide-y divide-surface-200 dark:divide-surface-600">
          {data.rankings.map((entry) => (
            <li
              key={entry.recruiter_id}
              className={cn(
                'flex items-center gap-4 px-4 py-3',
                entry.rank === 1 && 'bg-amber-500/10 dark:bg-amber-500/5'
              )}
            >
              <span
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                  entry.rank === 1 && 'bg-amber-500 text-white',
                  entry.rank === 2 && 'bg-surface-300 dark:bg-surface-600 text-surface-700 dark:text-surface-200',
                  entry.rank === 3 && 'bg-amber-700/30 text-amber-800 dark:text-amber-200',
                  entry.rank > 3 && 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400'
                )}
              >
                {entry.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-surface-900 dark:text-surface-100">
                  {entry.recruiter?.name || entry.recruiter?.email || 'Unknown'}
                </div>
                <div className="flex flex-wrap gap-2 mt-0.5">
                  <span className="text-xs text-surface-500">
                    {entry.metrics.hires} hires · {entry.metrics.offers} offers · {entry.metrics.interviews} interviews
                  </span>
                  {entry.badges.length > 0 && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {entry.badges.join(' · ')}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-lg font-bold text-surface-800 dark:text-surface-200 tabular-nums">
                {entry.score}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
