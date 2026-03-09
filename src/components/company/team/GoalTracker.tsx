'use client';

import { useCallback, useEffect, useState } from 'react';
import { Target, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface GoalRow {
  id: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  period_start: string;
  period_end: string;
  status: string;
  assignee_id?: string | null;
}

export interface GoalTrackerProps {
  assigneeId?: string | null;
  className?: string;
}

export function GoalTracker({ assigneeId, className }: GoalTrackerProps) {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const url = assigneeId
        ? `/api/company/team/goals?assignee_id=${assigneeId}`
        : '/api/company/team/goals';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch {
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [assigneeId]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const goal_type = (form.elements.namedItem('goal_type') as HTMLInputElement).value;
    const target_value = Number((form.elements.namedItem('target_value') as HTMLInputElement).value);
    const period_start = (form.elements.namedItem('period_start') as HTMLInputElement).value;
    const period_end = (form.elements.namedItem('period_end') as HTMLInputElement).value;
    if (!goal_type || !target_value || !period_start || !period_end) return;
    setSaving(true);
    try {
      const res = await fetch('/api/company/team/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal_type,
          target_value,
          period_start,
          period_end,
          assignee_id: assigneeId ?? null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create');
      setShowAdd(false);
      fetchGoals();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 size={24} className="animate-spin text-surface-400" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-surface-600">
        <h3 className="font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <Target size={18} /> Goals
        </h3>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="text-sm text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
        >
          <Plus size={16} /> Add goal
        </button>
      </div>
      {showAdd && (
        <form onSubmit={handleAdd} className="p-4 border-b border-surface-200 dark:border-surface-600 space-y-2">
          <input
            name="goal_type"
            placeholder="Goal type (e.g. hires, applications)"
            className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
            required
          />
          <input
            name="target_value"
            type="number"
            placeholder="Target value"
            min={1}
            className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
            required
          />
          <div className="flex gap-2">
            <input
              name="period_start"
              type="date"
              className="flex-1 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
              required
            />
            <input
              name="period_end"
              type="date"
              className="flex-1 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}
      <ul className="divide-y divide-surface-200 dark:divide-surface-600">
        {goals.length === 0 && !showAdd ? (
          <li className="p-6 text-center text-surface-500 text-sm">No goals yet.</li>
        ) : (
          goals.map((g) => {
            const pct = g.target_value > 0 ? Math.min(100, (g.current_value / g.target_value) * 100) : 0;
            return (
              <li key={g.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-surface-800 dark:text-surface-200 capitalize">
                    {g.goal_type.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      g.status === 'achieved' && 'text-emerald-600 dark:text-emerald-400',
                      g.status === 'missed' && 'text-red-600 dark:text-red-400',
                      g.status === 'in_progress' && 'text-surface-600 dark:text-surface-400'
                    )}
                  >
                    {g.current_value} / {g.target_value}
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-surface-200 dark:bg-surface-600 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      g.status === 'achieved' && 'bg-emerald-500',
                      g.status === 'missed' && 'bg-red-500',
                      g.status === 'in_progress' && 'bg-brand-500'
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-surface-500 mt-0.5">
                  {g.period_start} → {g.period_end}
                </p>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
