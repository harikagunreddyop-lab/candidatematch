'use client';

import { useState, useEffect } from 'react';
import { Target, TrendingUp, TrendingDown } from 'lucide-react';
import type { RecruiterGoals } from '@/types/recruiter-dashboard';

const DEFAULT_GOALS: RecruiterGoals = {
  weekly_goals: {
    applications: { target: 0, current: 0 },
    interviews: { target: 0, current: 0 },
    offers: { target: 0, current: 0 },
  },
  monthly_goals: {
    hires: { target: 0, current: 0 },
    quality_score: { target: 0, current: 0 },
  },
  progress_this_week: 0,
  on_track: false,
  motivational_message: 'Goals are unavailable right now.',
};

function isGoalMetric(value: unknown): value is { target: number; current: number } {
  if (!value || typeof value !== 'object') return false;
  const v = value as { target?: unknown; current?: unknown };
  return typeof v.target === 'number' && typeof v.current === 'number';
}

function toRecruiterGoals(value: unknown): RecruiterGoals | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<RecruiterGoals>;
  if (!v.weekly_goals || !v.monthly_goals) return null;
  if (!isGoalMetric(v.weekly_goals.applications)) return null;
  if (!isGoalMetric(v.weekly_goals.interviews)) return null;
  if (!isGoalMetric(v.weekly_goals.offers)) return null;
  if (!isGoalMetric(v.monthly_goals.hires)) return null;
  if (!isGoalMetric(v.monthly_goals.quality_score)) return null;
  if (typeof v.progress_this_week !== 'number') return null;
  if (typeof v.on_track !== 'boolean') return null;
  return v as RecruiterGoals;
}

export function PerformanceGoalsWidget() {
  const [goals, setGoals] = useState<RecruiterGoals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch('/api/recruiter/dashboard/goals')
      .then(async (r) => {
        if (!r.ok) return null;
        const data = await r.json();
        return toRecruiterGoals(data);
      })
      .then((data) => {
        if (mounted) setGoals(data ?? DEFAULT_GOALS);
      })
      .catch(() => {
        if (mounted) setGoals(DEFAULT_GOALS);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading || !goals) {
    return (
      <div className="bg-surface-100 border border-surface-700/60 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-brand-400" />
          Performance vs Goals
        </h3>
        <div className="h-32 animate-pulse bg-surface-200 rounded" />
      </div>
    );
  }

  const pct = goals.progress_this_week;
  const onTrack = goals.on_track;

  return (
    <div className="bg-surface-100 border border-surface-700/60 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Target className="w-5 h-5 text-brand-400" />
        Performance vs Goals
      </h3>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-surface-400">This week</span>
            <span className={onTrack ? 'text-emerald-400' : 'text-amber-400'}>
              {onTrack ? (
                <TrendingUp className="w-4 h-4 inline mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 inline mr-1" />
              )}
              {pct}%
            </span>
          </div>
          <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                onTrack ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-surface-200/50">
            <p className="text-surface-500">Applications</p>
            <p className="font-semibold text-white">
              {goals.weekly_goals.applications.current} / {goals.weekly_goals.applications.target}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-surface-200/50">
            <p className="text-surface-500">Interviews</p>
            <p className="font-semibold text-white">
              {goals.weekly_goals.interviews.current} / {goals.weekly_goals.interviews.target}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-surface-200/50">
            <p className="text-surface-500">Offers</p>
            <p className="font-semibold text-white">
              {goals.weekly_goals.offers.current} / {goals.weekly_goals.offers.target}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-surface-200/50">
            <p className="text-surface-500">Hires (month)</p>
            <p className="font-semibold text-white">
              {goals.monthly_goals.hires.current} / {goals.monthly_goals.hires.target}
            </p>
          </div>
        </div>
        {goals.motivational_message && (
          <p className="text-sm text-surface-400 italic border-t border-surface-700/60 pt-3">
            {goals.motivational_message}
          </p>
        )}
      </div>
    </div>
  );
}
