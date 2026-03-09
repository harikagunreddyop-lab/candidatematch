'use client';

import { Skeleton } from '@/components/ui';
import { cn } from '@/utils/helpers';

export interface JobCardSkeletonProps {
  className?: string;
}

/** Loading skeleton for a single job card in the search grid */
export function JobCardSkeleton({ className }: JobCardSkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-surface-700/60 bg-surface-800/50 p-5 animate-pulse',
        className
      )}
    >
      <div className="flex gap-3">
        <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-6 w-10 rounded-lg shrink-0" />
          </div>
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
