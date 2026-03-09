'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { cn } from '@/utils/helpers';
import type { CostPerHireBreakdown } from './types';

const COST_TYPE_LABELS: Record<string, string> = {
  job_board: 'Job boards',
  recruiter_fee: 'Recruiter fees',
  advertising: 'Advertising',
  software: 'Software',
  other: 'Other',
};

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#64748b'];

interface CostPerHireWidgetProps {
  data: CostPerHireBreakdown | null;
  loading?: boolean;
  className?: string;
}

export function CostPerHireWidget({ data, loading, className }: CostPerHireWidgetProps) {
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
        <div className="h-48 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
        <p className="text-surface-500 text-sm">No cost data. Add entries in Hiring costs to see breakdown.</p>
      </div>
    );
  }

  const { total_cost_cents, total_hires, cost_per_hire_cents, breakdown_by_type } = data;
  const pieData = breakdown_by_type.map((b, i) => ({
    name: COST_TYPE_LABELS[b.type] || b.type,
    value: b.amount_cents,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-1 h-5 rounded bg-amber-500" />
        Cost per Hire
      </h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="rounded-lg bg-surface-900/50 p-3">
          <div className="text-xl font-bold text-white">${(cost_per_hire_cents / 100).toLocaleString()}</div>
          <div className="text-xs text-surface-500">Per hire</div>
        </div>
        <div className="rounded-lg bg-surface-900/50 p-3">
          <div className="text-xl font-bold text-white">${(total_cost_cents / 100).toLocaleString()}</div>
          <div className="text-xs text-surface-500">Total ({total_hires} hires)</div>
        </div>
      </div>
      {pieData.length > 0 ? (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={64}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                formatter={(value: number | undefined) => [`$${value != null ? (value / 100).toLocaleString() : '0'}`, '']}
              />
              <Legend formatter={(name) => <span className="text-surface-300 text-xs">{name}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-surface-500 text-sm">Add hiring costs to see breakdown.</p>
      )}
    </div>
  );
}
