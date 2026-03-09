'use client';

import { useDraggable } from '@dnd-kit/core';
import { Calendar, Building2 } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { formatRelative, formatDate } from '@/utils/helpers';
import type { Application, ApplicationStatus } from '@/types/applications';
import { getApplicationJob, daysInStatus } from '@/types/applications';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  ready: 'Ready',
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  ready: 'bg-surface-500/20 text-surface-400',
  applied: 'bg-blue-500/20 text-blue-400',
  screening: 'bg-amber-500/20 text-amber-400',
  interview: 'bg-brand-500/20 text-brand-400',
  offer: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-red-500/20 text-red-400',
  withdrawn: 'bg-surface-500/20 text-surface-500',
};

export interface ApplicationCardProps {
  application: Application;
  onClick?: (application: Application) => void;
  className?: string;
}

export function ApplicationCard({ application, onClick, className }: ApplicationCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: application.id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const job = getApplicationJob(application);
  const days = application.days_in_status ?? daysInStatus(application.updated_at);
  const status = application.status as ApplicationStatus;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border border-surface-700/60 bg-surface-800/80 p-4 cursor-grab active:cursor-grabbing',
        'hover:border-brand-500/40 transition-colors',
        isDragging && 'opacity-90 shadow-lg z-50 border-brand-500',
        className
      )}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(application)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(application);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-surface-100 truncate">{job?.title || 'Application'}</h3>
          <p className="text-sm text-surface-400 flex items-center gap-1 mt-0.5">
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{job?.company || '—'}</span>
          </p>
        </div>
        <span className={cn('shrink-0 px-2 py-0.5 rounded-md text-xs font-medium', STATUS_COLORS[status])}>
          {STATUS_LABELS[status]}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-surface-500">
        {application.applied_at && (
          <span>Applied {formatRelative(application.applied_at)}</span>
        )}
        {application.interview_date && (
          <span className="flex items-center gap-1 text-brand-400">
            <Calendar className="w-3 h-3" />
            {formatDate(application.interview_date)}
          </span>
        )}
        {days > 0 && (
          <span>{days}d in stage</span>
        )}
      </div>
      {application.next_action_required && (
        <p className="mt-2 text-xs text-surface-400 truncate" title={application.next_action_required}>
          Next: {application.next_action_required}
        </p>
      )}
    </div>
  );
}
