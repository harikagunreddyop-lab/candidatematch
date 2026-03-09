'use client';

import { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { JobCardJob } from './JobCard';

export interface SalaryInsightsWidgetProps {
  jobs: JobCardJob[];
  candidateSalaryMin?: number | null;
  candidateSalaryMax?: number | null;
  title?: string;
  /** When set, fetch market salary from external API (e.g. Adzuna) for this role. */
  marketRoleTitle?: string | null;
  marketRoleLocation?: string | null;
  className?: string;
}

export function SalaryInsightsWidget({
  jobs,
  candidateSalaryMin,
  candidateSalaryMax,
  title = 'Salary insights',
  marketRoleTitle,
  marketRoleLocation,
  className,
}: SalaryInsightsWidgetProps) {
  const [market, setMarket] = useState<{ min: number; max: number; median: number; count: number; source: string } | null>(null);

  const effectiveTitle = marketRoleTitle ?? (jobs[0]?.title ?? null);
  const effectiveLocation = marketRoleLocation ?? (jobs[0]?.location ?? null);

  useEffect(() => {
    if (!effectiveTitle) return;
    const params = new URLSearchParams({ title: effectiveTitle });
    if (effectiveLocation) params.set('location', effectiveLocation);
    fetch(`/api/salary-insights?${params}`)
      .then((r) => r.json())
      .then((data) => data.market && setMarket(data.market))
      .catch(() => {});
  }, [effectiveTitle, effectiveLocation]);

  const withSalary = jobs.filter((j) => j.salary_min != null || j.salary_max != null);
  if (withSalary.length === 0 && !market) return null;

  const mins = withSalary.map((j) => j.salary_min).filter((v): v is number => v != null);
  const maxs = withSalary.map((j) => j.salary_max).filter((v): v is number => v != null);
  const low = mins.length ? Math.min(...mins) : null;
  const high = maxs.length ? Math.max(...maxs) : null;
  const avgMin = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
  const avgMax = maxs.length ? Math.round(maxs.reduce((a, b) => a + b, 0) / maxs.length) : null;

  const inRange =
    candidateSalaryMin != null &&
    candidateSalaryMax != null &&
    low != null &&
    high != null &&
    candidateSalaryMin <= high &&
    candidateSalaryMax >= low;

  const hasSearchData = withSalary.length > 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-surface-700 bg-surface-800/50 p-4',
        className
      )}
    >
      <h3 className="text-sm font-semibold text-surface-200 mb-3 flex items-center gap-2">
        <DollarSign size={16} />
        {title}
      </h3>
      {hasSearchData && (
        <p className="text-xs text-surface-500 mb-2">
          Based on {withSalary.length} job{withSalary.length !== 1 ? 's' : ''} in this search
        </p>
      )}
      <div className="space-y-2 text-sm">
        {market && (
          <p className="text-surface-200">
            Market ({market.source}): <span className="font-medium text-brand-400">${(market.min / 1000).toFixed(0)}k – ${(market.max / 1000).toFixed(0)}k</span>
            {market.count > 0 && <span className="text-xs text-surface-500 ml-1">({market.count} listings)</span>}
          </p>
        )}
        {low != null && high != null && (
          <p className="text-surface-200">
            Range: <span className="font-medium text-brand-400">${(low / 1000).toFixed(0)}k – ${(high / 1000).toFixed(0)}k</span>
          </p>
        )}
        {avgMin != null && avgMax != null && (
          <p className="text-surface-400">
            Typical band: ${(avgMin / 1000).toFixed(0)}k – ${(avgMax / 1000).toFixed(0)}k
          </p>
        )}
        {candidateSalaryMin != null && candidateSalaryMax != null && (
          <p className="text-surface-400 pt-1 border-t border-surface-700">
            Your target: ${(candidateSalaryMin / 1000).toFixed(0)}k – ${(candidateSalaryMax / 1000).toFixed(0)}k
            {low != null && high != null && (
              <span className={cn('ml-2 text-xs', inRange ? 'text-emerald-400' : 'text-amber-400')}>
                {inRange ? '✓ In market range' : 'Outside typical range'}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
