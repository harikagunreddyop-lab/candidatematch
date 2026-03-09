'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckSquare, Plus, Loader2, Calendar } from 'lucide-react';
import { cn, formatDate } from '@/utils/helpers';

interface TaskRow {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  due_date?: string | null;
  priority?: string | null;
  assignee_id?: string | null;
  assignee?: { id: string; name: string | null; email: string | null } | null;
}

export interface TaskListProps {
  assigneeId?: string | null;
  statusFilter?: string | null;
  className?: string;
}

export function TaskList({ assigneeId, statusFilter, className }: TaskListProps) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (assigneeId) params.set('assignee_id', assigneeId);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/company/team/tasks?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [assigneeId, statusFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const title = (form.elements.namedItem('title') as HTMLInputElement).value.trim();
    const description = (form.elements.namedItem('description') as HTMLInputElement).value.trim();
    if (!title) return;
    const res = await fetch('/api/company/team/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description || null,
        assignee_id: assigneeId ?? null,
      }),
    });
    if (res.ok) {
      setShowAdd(false);
      fetchTasks();
    }
  };

  const setStatus = async (taskId: string, status: string) => {
    const res = await fetch(`/api/company/team/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchTasks();
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
          <CheckSquare size={18} /> Tasks
        </h3>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="text-sm text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
        >
          <Plus size={16} /> Add task
        </button>
      </div>
      {showAdd && (
        <form onSubmit={handleAdd} className="p-4 border-b border-surface-200 dark:border-surface-600 space-y-2">
          <input
            name="title"
            placeholder="Task title"
            className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
            required
          />
          <input
            name="description"
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
          />
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-medium">
            Add
          </button>
        </form>
      )}
      <ul className="divide-y divide-surface-200 dark:divide-surface-600">
        {tasks.length === 0 && !showAdd ? (
          <li className="p-6 text-center text-surface-500 text-sm">No tasks yet.</li>
        ) : (
          tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={t.status === 'completed'}
                onChange={() => setStatus(t.id, t.status === 'completed' ? 'pending' : 'completed')}
                className="rounded border-surface-300 dark:border-surface-600 text-brand-500"
              />
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    'font-medium text-surface-800 dark:text-surface-200',
                    t.status === 'completed' && 'line-through text-surface-500'
                  )}
                >
                  {t.title}
                </span>
                {t.due_date && (
                  <p className="text-xs text-surface-500 flex items-center gap-1 mt-0.5">
                    <Calendar size={12} /> {formatDate(t.due_date)}
                  </p>
                )}
              </div>
              <select
                value={t.status}
                onChange={(e) => setStatus(t.id, e.target.value)}
                className="text-xs rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2 py-1"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
