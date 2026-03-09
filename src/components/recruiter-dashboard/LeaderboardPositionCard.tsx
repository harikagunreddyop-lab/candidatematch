'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, Medal } from 'lucide-react';
import type { LeaderboardPosition } from '@/types/recruiter-dashboard';

const DEFAULT_POSITION: LeaderboardPosition = {
  rank: 0,
  total_recruiters: 0,
  period: 'monthly',
  period_start: '',
  period_end: '',
  score: 0,
  metrics: { hires: 0, offers: 0, interviews: 0, applications: 0 },
  badges: [],
};

function isLeaderboardPosition(value: unknown): value is LeaderboardPosition {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<LeaderboardPosition>;
  if (typeof v.rank !== 'number') return false;
  if (typeof v.total_recruiters !== 'number') return false;
  if (typeof v.period !== 'string') return false;
  if (typeof v.score !== 'number') return false;
  if (!v.metrics || typeof v.metrics !== 'object') return false;
  const m = v.metrics as LeaderboardPosition['metrics'];
  if (typeof m.hires !== 'number') return false;
  if (typeof m.offers !== 'number') return false;
  if (typeof m.interviews !== 'number') return false;
  if (typeof m.applications !== 'number') return false;
  if (!Array.isArray(v.badges)) return false;
  return true;
}

export function LeaderboardPositionCard() {
  const [position, setPosition] = useState<LeaderboardPosition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch('/api/recruiter/dashboard/leaderboard-position?period=monthly')
      .then(async (r) => {
        if (!r.ok) return null;
        const data = await r.json();
        return isLeaderboardPosition(data) ? data : null;
      })
      .then((data) => {
        if (mounted) setPosition(data ?? DEFAULT_POSITION);
      })
      .catch(() => {
        if (mounted) setPosition(DEFAULT_POSITION);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading || !position) {
    return (
      <div className="bg-surface-100 border border-surface-700/60 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-brand-400" />
          Leaderboard
        </h3>
        <div className="h-20 animate-pulse bg-surface-200 rounded" />
      </div>
    );
  }

  return (
    <Link
      href="/dashboard/company/team?tab=leaderboard"
      className="block bg-surface-100 border border-surface-700/60 rounded-xl p-6 hover:bg-surface-200/30 transition-colors"
    >
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-brand-400" />
        Team Leaderboard
      </h3>
      <div className="flex items-center gap-4">
        <div className="shrink-0 w-14 h-14 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/20 flex items-center justify-center border border-amber-500/40">
          <Medal className="w-7 h-7 text-amber-400" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">
            #{position.rank || '—'} of {position.total_recruiters}
          </p>
          <p className="text-sm text-surface-400 capitalize">{position.period}</p>
          {position.badges.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {position.badges.map((b) => (
                <span
                  key={b}
                  className="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-sm text-surface-500 mt-3">
        Score: {position.score} · Hires: {position.metrics.hires} · Offers:{' '}
        {position.metrics.offers}
      </p>
    </Link>
  );
}
