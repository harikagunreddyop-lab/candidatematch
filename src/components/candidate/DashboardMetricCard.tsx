'use client';

import Link from 'next/link';
import { cn } from '@/utils/helpers';
import { Skeleton } from '@/components/ui';

export interface DashboardMetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  /** e.g. "bg-brand-400/10 text-brand-400" */
  iconClassName?: string;
  href?: string;
  trend?: { value: number; direction: 'up' | 'down' };
  loading?: boolean;
  'aria-label'?: string;
  onCtaClick?: () => void;
}

export function DashboardMetricCard({
  label,
  value,
  subtext,
  icon,
  iconClassName = 'bg-brand-400/10 text-brand-400',
  href,
  trend,
  loading,
  'aria-label': ariaLabel,
  onCtaClick,
}: DashboardMetricCardProps) {
  if (loading) {
    return (
      <div
        className="bg-surface-800 rounded-xl p-6 border border-surface-700/60"
        role="presentation"
        aria-busy="true"
      >
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-6 w-16 mb-1" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
    );
  }

  const content = (
    <div
      className={cn(
        'bg-surface-800 rounded-xl p-6 border border-surface-700/60',
        href && 'hover:border-brand-400/50 transition-colors'
      )}
      role={href ? undefined : 'group'}
      aria-label={ariaLabel ?? (typeof label === 'string' ? `${label}: ${value}` : undefined)}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
            iconClassName
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          <p className="text-xs text-surface-400 uppercase tracking-wide">{label}</p>
        </div>
        {trend !== undefined && (
          <span
            className={cn(
              'text-xs font-semibold shrink-0',
              trend.direction === 'up' ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {trend.direction === 'up' ? '↑' : '↓'} {trend.value}%
          </span>
        )}
      </div>
      {subtext && <p className="text-xs text-surface-500 mt-1">{subtext}</p>}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={onCtaClick}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900 rounded-xl"
      >
        {content}
      </Link>
    );
  }

  return content;
}
