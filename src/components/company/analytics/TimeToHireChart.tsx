'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/utils/helpers';
import type { TimeToHireMetrics } from './types';

interface TimeToHireChartProps {
  data: TimeToHireMetrics | null;
  loading?: boolean;
  className?: string;
}

export function TimeToHireChart({ data, loading, className }: TimeToHireChartProps) {
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
        <p className="text-surface-500 text-sm">No time-to-hire data.</p>
      </div>
    );
  }

  const { avg_days, median_days, trend } = data;

  return (
    <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-1 h-5 rounded bg-emerald-500" />
        Time to Hire
      </h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="rounded-lg bg-surface-900/50 p-3">
          <div className="text-2xl font-bold text-white">{Math.round(avg_days)}</div>
          <div className="text-xs text-surface-500">Avg days</div>
        </div>
        <div className="rounded-lg bg-surface-900/50 p-3">
          <div className="text-2xl font-bold text-white">{median_days}</div>
          <div className="text-xs text-surface-500">Median days</div>
        </div>
      </div>
      {trend.length > 0 ? (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => v.slice(0, 10)} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelFormatter={(v) => v}
                formatter={(value: number | undefined) => [`${value != null ? Math.round(value) : 0} days`, 'Avg days']}
              />
              <Line type="monotone" dataKey="avg_days" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Avg days" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-surface-500 text-sm">No trend data in this period.</p>
      )}
    </div>
  );
}
