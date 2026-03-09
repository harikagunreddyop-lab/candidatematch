'use client';

import { Check, Circle, Target } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { Skeleton } from '@/components/ui';
import type { ProfileCompletionItem } from '@/lib/profile-completion';

export interface ProfileCompletionWidgetProps {
  completionPercent: number;
  strengthScore: number | null;
  checklist: ProfileCompletionItem[];
  loading?: boolean;
  onSectionClick?: (key: string) => void;
}

export function ProfileCompletionWidget({
  completionPercent,
  strengthScore,
  checklist,
  loading,
  onSectionClick,
}: ProfileCompletionWidgetProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-surface-300 bg-surface-100 p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const incomplete = checklist.filter((i) => !i.filled);

  return (
    <div
      className="rounded-2xl border border-surface-300 bg-surface-100 p-6 shadow-sm"
      role="region"
      aria-label="Profile completion"
    >
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-5 h-5 text-brand-600" />
        <h3 className="text-sm font-bold text-surface-900">Profile completion</h3>
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-2xl font-bold text-surface-900 tabular-nums">
          {completionPercent}%
        </span>
        {strengthScore != null && (
          <span className="text-sm text-surface-600">
            Strength: {strengthScore}/100
          </span>
        )}
      </div>
      <div className="h-2 bg-surface-200 rounded-full overflow-hidden mb-4">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            completionPercent >= 100 ? 'bg-emerald-500' : 'bg-brand-500'
          )}
          style={{ width: `${Math.min(100, completionPercent)}%` }}
        />
      </div>
      <ul className="space-y-2">
        {checklist.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onSectionClick?.(item.key)}
              className={cn(
                'flex items-center gap-2 w-full text-left text-sm rounded-lg px-2 py-1 -mx-2 transition-colors',
                item.filled
                  ? 'text-surface-700'
                  : 'text-surface-600 hover:bg-surface-200'
              )}
            >
              {item.filled ? (
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 shrink-0 opacity-50" />
              )}
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {incomplete.length > 0 && (
        <p className="text-xs text-surface-600 mt-3">
          Complete the missing sections below to improve your profile.
        </p>
      )}
    </div>
  );
}
