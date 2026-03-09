'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { cn } from '@/utils/helpers';
import type { FunnelData } from './types';

const STAGE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#22c55e'];

interface HiringFunnelChartProps {
  data: FunnelData[];
  loading?: boolean;
  className?: string;
}

export function HiringFunnelChart({ data, loading, className }: HiringFunnelChartProps) {
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({ name: d.stage, count: d.count, fill: '' }));

  return (
    <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-1 h-5 rounded bg-brand-400" />
        Hiring Funnel
      </h2>
      {data.length === 0 ? (
        <p className="text-surface-500 text-sm py-8 text-center">No application data in this period.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 mb-4">
            {data.map((stage, i) => (
              <div key={stage.stage} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: STAGE_COLORS[i % STAGE_COLORS.length] }}
                />
                <span className="text-sm text-surface-300">{stage.stage}:</span>
                <span className="font-semibold text-white">{stage.count}</span>
                {stage.drop_rate != null && stage.drop_rate > 0 && (
                  <span className="text-xs text-surface-500">({stage.drop_rate.toFixed(0)}% drop)</span>
                )}
              </div>
            ))}
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={12} width={70} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#f1f5f9' }}
                  formatter={(value: number | undefined, name: string | undefined, props: { payload?: { name: string } }) => {
                    const stage = data.find((d) => d.stage === (props.payload?.name ?? name));
                    const pct = stage?.percentage != null ? `${stage.percentage.toFixed(1)}%` : '';
                    return [value ?? 0, pct];
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} minPointSize={8}>
                  {chartData.map((_, index) => (
                    <Cell key={index} fill={STAGE_COLORS[index % STAGE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
