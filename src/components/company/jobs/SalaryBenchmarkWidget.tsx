'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface SalaryBenchmarkWidgetProps {
  jobTitle: string;
  location?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  className?: string;
}

export function SalaryBenchmarkWidget({
  jobTitle,
  location,
  salaryMin,
  salaryMax,
  className,
}: SalaryBenchmarkWidgetProps) {
  const [market, setMarket] = useState<{
    min: number;
    max: number;
    median: number;
    count: number;
    source: string;
  } | null>(null);
  const [loading, setLoading] = useState(!!jobTitle);

  useEffect(() => {
    if (!jobTitle.trim()) return;
    setLoading(true);
    const params = new URLSearchParams({ title: jobTitle.trim() });
    if (location) params.set('location', location);
    fetch(`/api/salary-insights?${params}`)
      .then((r) => r.json())
      .then((data) => data.market && setMarket(data.market))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobTitle, location]);

  if (!jobTitle) return null;

  const inputMedian =
    salaryMin != null && salaryMax != null ? (salaryMin + salaryMax) / 2 : null;
  let competitiveness: 'below_market' | 'at_market' | 'above_market' | null = null;
  if (market && inputMedian != null) {
    if (inputMedian < market.median * 0.9) competitiveness = 'below_market';
    else if (inputMedian > market.median * 1.1) competitiveness = 'above_market';
    else competitiveness = 'at_market';
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-surface-700 bg-surface-800/50 p-6',
        className
      )}
    >
      <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
        <DollarSign className="w-5 h-5 text-emerald-400" />
        Salary benchmark
      </h3>
      {loading ? (
        <p className="text-surface-500 text-sm">Loading market data...</p>
      ) : market ? (
        <div className="space-y-3 text-sm">
          <p className="text-surface-300">
            <span className="text-surface-500">Market ({market.source}):</span>{' '}
            <span className="font-medium text-white">
              ${(market.min / 1000).toFixed(0)}k – ${(market.max / 1000).toFixed(0)}k
            </span>
            {market.count > 0 && (
              <span className="text-surface-500 ml-1">({market.count} listings)</span>
            )}
          </p>
          <p className="text-surface-400">
            Median: <span className="text-white font-medium">${(market.median / 1000).toFixed(0)}k</span>
          </p>
          {salaryMin != null && salaryMax != null && (
            <>
              <p className="text-surface-400">
                Your range: ${(salaryMin / 1000).toFixed(0)}k – ${(salaryMax / 1000).toFixed(0)}k
              </p>
              {competitiveness && (
                <p
                  className={cn(
                    'flex items-center gap-1.5 font-medium',
                    competitiveness === 'below_market' && 'text-amber-400',
                    competitiveness === 'at_market' && 'text-emerald-400',
                    competitiveness === 'above_market' && 'text-brand-400'
                  )}
                >
                  <TrendingUp className="w-4 h-4" />
                  {competitiveness === 'below_market' && 'Below market — consider raising to attract talent'}
                  {competitiveness === 'at_market' && 'At market'}
                  {competitiveness === 'above_market' && 'Above market — strong positioning'}
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="text-surface-500 text-sm">
          Add job title and optional location to see market salary. Configure ADZUNA_* env for external data.
        </p>
      )}
    </div>
  );
}
