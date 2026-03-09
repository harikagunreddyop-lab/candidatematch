'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Check, Sparkles, Loader2, Play, Square } from 'lucide-react';
import type { DailyTask } from '@/types/recruiter-dashboard';

const TYPE_LABELS: Record<string, string> = {
  follow_up: 'Follow up',
  screen_resume: 'Screen',
  schedule_interview: 'Schedule',
  send_offer: 'Offer',
  update_status: 'Update',
};

function formatElapsed(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return s >= 60 ? `${m + 1}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function isDailyTask(value: unknown): value is DailyTask {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<DailyTask>;
  return (
    typeof t.id === 'string' &&
    typeof t.type === 'string' &&
    typeof t.title === 'string' &&
    typeof t.description === 'string' &&
    typeof t.priority_score === 'number' &&
    typeof t.estimated_time_minutes === 'number'
  );
}

export function DailyTaskList() {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [useAi, setUseAi] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/recruiter/dashboard/tasks?prioritize=${useAi ? 'ai' : ''}`)
      .then(async (r) => {
        if (!r.ok) return [] as DailyTask[];
        const data = await r.json();
        const list = Array.isArray(data?.tasks) ? data.tasks.filter(isDailyTask) : [];
        return list as DailyTask[];
      })
      .then((safeTasks) => setTasks(safeTasks))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [useAi]);

  useEffect(() => {
    if (activeTaskId == null || startedAt == null) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(t);
  }, [activeTaskId, startedAt]);

  const handleStart = useCallback((id: string) => {
    setActiveTaskId(id);
    setStartedAt(Date.now());
    setElapsed(0);
  }, []);

  const handleComplete = useCallback(
    async (task: DailyTask) => {
      const id = task.id;
      setCompletedIds((prev) => new Set(prev).add(id));
      const wasActive = activeTaskId === id;
      const actualMinutes = wasActive && startedAt != null
        ? Math.round((Date.now() - startedAt) / 60000)
        : undefined;
      if (wasActive) {
        setActiveTaskId(null);
        setStartedAt(null);
        setElapsed(0);
      }
      try {
        await fetch('/api/recruiter/dashboard/complete-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: id,
            task_type: task.type,
            actual_minutes: actualMinutes ?? task.estimated_time_minutes,
          }),
        });
      } catch {
        // ignore
      }
    },
    [activeTaskId, startedAt]
  );

  const visibleTasks = tasks.filter((t) => !completedIds.has(t.id));

  return (
    <div className="bg-surface-100 border border-surface-700/60 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-surface-700/60 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-brand-400" />
          Today&apos;s Tasks
        </h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useAi}
            onChange={(e) => setUseAi(e.target.checked)}
            className="rounded border-surface-500 bg-surface-200 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-surface-300">AI prioritize</span>
        </label>
      </div>
      <div className="divide-y divide-surface-700/50">
        {loading ? (
          <div className="p-6 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="p-6 text-center text-surface-500 text-sm">
            No pending tasks. Great job!
          </div>
        ) : (
          visibleTasks.slice(0, 10).map((task) => {
            const isActive = activeTaskId === task.id;
            return (
              <div
                key={task.id}
                className="p-4 hover:bg-surface-200/30 transition-colors flex items-start gap-3"
              >
                <div className="shrink-0 flex items-center gap-1">
                  {!isActive ? (
                    <button
                      type="button"
                      onClick={() => handleStart(task.id)}
                      className="w-8 h-8 rounded border border-surface-500 hover:border-brand-400 hover:bg-brand-500/10 flex items-center justify-center text-surface-400 hover:text-brand-400"
                      aria-label="Start timer"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleComplete(task)}
                      className="w-8 h-8 rounded border border-brand-500 bg-brand-500/20 flex items-center justify-center text-brand-400"
                      aria-label="Mark complete"
                    >
                      <Square className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleComplete(task)}
                    className="w-5 h-5 rounded border border-surface-500 hover:border-brand-400 flex items-center justify-center text-transparent hover:text-brand-400"
                    aria-label="Mark complete without timer"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-surface-400 uppercase tracking-wide">
                      {TYPE_LABELS[task.type] ?? task.type}
                    </span>
                    <span className="text-xs text-surface-500">
                      {task.priority_score}% · ~{task.estimated_time_minutes}m
                    </span>
                    {isActive && (
                      <span className="text-xs text-brand-400 font-mono">
                        {formatElapsed(elapsed)}
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-white mt-0.5">{task.title}</p>
                  <p className="text-sm text-surface-400 mt-0.5 line-clamp-1">
                    {task.description}
                  </p>
                  {task.ai_reasoning && (
                    <p className="text-xs text-surface-500 mt-1 italic">
                      {task.ai_reasoning}
                    </p>
                  )}
                  {(task.related_application_id || task.related_job_id) && (
                    <Link
                      href={
                        task.related_application_id
                          ? `/dashboard/recruiter/applications?highlight=${task.related_application_id}`
                          : task.related_job_id
                            ? `/dashboard/recruiter/jobs/${task.related_job_id}`
                            : '/dashboard/recruiter/applications'
                      }
                      className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 mt-2"
                    >
                      Open
                    </Link>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
