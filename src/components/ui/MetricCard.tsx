'use client';

import Link from 'next/link';
import { cn } from '@/utils/helpers';

export interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  /** Tailwind gradient classes, e.g. "from-brand-500 to-brand-700" */
  gradient: string;
  href?: string;
  trend?: { value: number; direction: 'up' | 'down' };
}

export function MetricCard({
  label,
  value,
  subtext,
  icon,
  gradient,
  href,
  trend,
}: MetricCardProps) {
  const content = (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl transition-all hover:scale-[1.02] hover:shadow-2xl group',
        `bg-gradient-to-br p-[1px] ${gradient}`
      )}
    >
      <div className="bg-surface-bg rounded-[11px] p-6 h-full min-h-[120px]">
        <div className="flex items-center justify-between mb-4">
          {icon && (
            <div
              className={cn(
                'p-3 rounded-xl transition-transform group-hover:scale-110 bg-surface-200/80 text-brand-400'
              )}
            >
              {icon}
            </div>
          )}
          {trend !== undefined && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-semibold',
                trend.direction === 'up' ? 'text-emerald-400' : 'text-red-400'
              )}
            >
              {trend.direction === 'up' ? '↑' : '↓'} {trend.value}%
            </span>
          )}
        </div>
        <div className="text-4xl font-bold text-white mb-2 font-display tabular-nums">
          {value}
        </div>
        <div className="text-sm font-medium text-surface-400">{label}</div>
        {subtext && (
          <div className="text-xs text-surface-500 mt-2">{subtext}</div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg rounded-xl">
        {content}
      </Link>
    );
  }

  return content;
}
