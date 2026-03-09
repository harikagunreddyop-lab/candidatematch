'use client';

import Link from 'next/link';
import { Target, User, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { Skeleton } from '@/components/ui';

const DEFAULT_WEEKLY_GOAL = 5;

export interface GoalsProgressWidgetProps {
  profileCompletionPercent: number;
  weeklyApplicationGoal?: number;
  applicationsThisWeek?: number;
  loading?: boolean;
  onTrackCtaClick?: () => void;
}

export function GoalsProgressWidget({
  profileCompletionPercent,
  weeklyApplicationGoal = DEFAULT_WEEKLY_GOAL,
  applicationsThisWeek = 0,
  loading,
  onTrackCtaClick,
}: GoalsProgressWidgetProps) {
  if (loading) {
    return (
      <div className="bg-surface-800 rounded-xl p-6 border border-surface-700/60 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-3 w-3/4 rounded-full" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    );
  }

  const profileComplete = profileCompletionPercent >= 100;
  const appsProgress = Math.min(100, (applicationsThisWeek / weeklyApplicationGoal) * 100);

  return (
    <div
      className="bg-surface-800 rounded-xl p-6 border border-surface-700/60"
      role="region"
      aria-label="Goals and progress"
    >
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Target className="w-4 h-4 text-brand-400" />
        Your goals
      </h3>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-surface-400 flex items-center gap-1">
              <User className="w-3 h-3" /> Profile
            </span>
            <span className="text-surface-300">{profileCompletionPercent}%</span>
          </div>
          <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                profileComplete ? 'bg-emerald-500' : 'bg-brand-400'
              )}
              style={{ width: `${Math.min(100, profileCompletionPercent)}%` }}
            />
          </div>
          {!profileComplete && (
            <Link
              href="/dashboard/candidate/settings"
              className="text-xs text-brand-400 hover:text-brand-300 mt-1 inline-flex items-center gap-0.5"
            >
              Complete profile <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-surface-400">Applications this week</span>
            <span className="text-surface-300">
              {applicationsThisWeek} / {weeklyApplicationGoal}
            </span>
          </div>
          <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                appsProgress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
              )}
              style={{ width: `${appsProgress}%` }}
            />
          </div>
          {onTrackCtaClick && (
            <button
              type="button"
              onClick={onTrackCtaClick}
              className="text-xs text-brand-400 hover:text-brand-300 mt-1 inline-flex items-center gap-0.5"
            >
              Track goal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
