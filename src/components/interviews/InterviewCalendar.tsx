'use client';

import { useMemo } from 'react';
import { formatTime, getMonthStart, getMonthEnd } from '@/lib/interview-utils';
import type { Interview } from '@/types/interviews';
import { cn } from '@/utils/helpers';

function getJob(interview: Interview) {
  const j = interview.job;
  if (!j) return null;
  return Array.isArray(j) ? j[0] ?? null : j;
}

interface InterviewCalendarProps {
  interviews: Interview[];
  month: Date;
  onSelectInterview?: (interview: Interview) => void;
  className?: string;
}

export function InterviewCalendar({ interviews, month, onSelectInterview, className }: InterviewCalendarProps) {
  const { start: _start, end: _end, days } = useMemo(() => {
    const start = getMonthStart(month);
    const end = getMonthEnd(month);
    const firstDow = start.getDay();
    const padStart = firstDow === 0 ? 6 : firstDow - 1;
    const daysInMonth = end.getDate();
    const totalCells = Math.ceil((padStart + daysInMonth) / 7) * 7;
    const days: { date: Date; isCurrentMonth: boolean; dayNum: number }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() - padStart + i);
      days.push({
        date: d,
        isCurrentMonth: d.getMonth() === month.getMonth(),
        dayNum: d.getDate(),
      });
    }
    return { start, end, days };
  }, [month]);

  const interviewsByDay = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const i of interviews) {
      const d = new Date(i.scheduled_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    return map;
  }, [interviews]);

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 overflow-hidden', className)}>
      <div className="grid grid-cols-7 text-center text-xs font-medium text-surface-500 dark:text-surface-400 border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50">
        {weekDays.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-fr min-h-[280px]">
        {days.map((cell, idx) => {
          const key = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(cell.dayNum).padStart(2, '0')}`;
          const dayInterviews = interviewsByDay.get(key) ?? [];
          const isToday =
            cell.date.getDate() === new Date().getDate() &&
            cell.date.getMonth() === new Date().getMonth() &&
            cell.date.getFullYear() === new Date().getFullYear();
          return (
            <div
              key={idx}
              className={cn(
                'min-h-[60px] p-1 border-b border-r border-surface-200 dark:border-surface-700',
                !cell.isCurrentMonth && 'bg-surface-50 dark:bg-surface-800/30',
                isToday && 'bg-brand-500/10 dark:bg-brand-500/20'
              )}
            >
              <span
                className={cn(
                  'inline-block w-7 h-7 text-sm flex items-center justify-center rounded-full',
                  cell.isCurrentMonth ? 'text-surface-800 dark:text-surface-200' : 'text-surface-400 dark:text-surface-500',
                  isToday && 'bg-brand-500 text-white font-semibold'
                )}
              >
                {cell.dayNum}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {dayInterviews.slice(0, 2).map((inv) => {
                  const job = getJob(inv);
                  return (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => onSelectInterview?.(inv)}
                      className="w-full text-left text-[10px] sm:text-xs truncate rounded px-1 py-0.5 bg-brand-500/20 dark:bg-brand-500/30 text-brand-700 dark:text-brand-200 hover:bg-brand-500/30 dark:hover:bg-brand-500/40"
                      title={`${job?.company ?? 'Interview'} – ${formatTime(inv.scheduled_at)}`}
                    >
                      {job?.company ?? 'Interview'} {formatTime(inv.scheduled_at)}
                    </button>
                  );
                })}
                {dayInterviews.length > 2 && (
                  <span className="text-[10px] text-surface-500 dark:text-surface-400 px-1">
                    +{dayInterviews.length - 2}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
