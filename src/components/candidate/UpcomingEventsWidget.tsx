'use client';

import Link from 'next/link';
import { Calendar, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { Skeleton } from '@/components/ui';
import { formatDate } from '@/utils/helpers';

export interface UpcomingEventItem {
  id: string;
  type: 'interview' | 'follow_up' | 'reminder' | 'offer_deadline';
  title: string;
  at: string;
  applicationId?: string;
  jobId?: string;
  jobTitle?: string;
  company?: string;
  note?: string;
}

export interface UpcomingEventsWidgetProps {
  upcoming: UpcomingEventItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = now.toDateString();
  const eventDate = d.toDateString();
  if (eventDate === today) {
    return `Today, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (eventDate === tomorrow.toDateString()) {
    return `Tomorrow, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  return formatDate(iso) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function eventIcon(type: UpcomingEventItem['type']) {
  switch (type) {
    case 'interview':
      return <Calendar className="w-4 h-4 text-emerald-400" />;
    case 'offer_deadline':
      return <AlertCircle className="w-4 h-4 text-amber-400" />;
    default:
      return <Clock className="w-4 h-4 text-blue-400" />;
  }
}

export function UpcomingEventsWidget({
  upcoming,
  loading,
  error,
  onRetry,
}: UpcomingEventsWidgetProps) {
  if (loading) {
    return (
      <div className="bg-surface-800 rounded-xl p-6 border border-surface-700/60 space-y-3">
        <Skeleton className="h-5 w-40" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-3/4 mb-1" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="bg-surface-800 rounded-xl p-6 border border-surface-700/60 text-center"
        role="alert"
      >
        <p className="text-surface-400 mb-2">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm text-brand-400 hover:text-brand-300 font-medium"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="bg-surface-800 rounded-xl p-6 border border-surface-700/60"
      role="region"
      aria-label="Upcoming events and deadlines"
    >
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-brand-400" />
        Upcoming
      </h3>

      {upcoming.length === 0 ? (
        <div className="text-center py-4">
          <Clock className="w-10 h-10 text-surface-600 mx-auto mb-2" />
          <p className="text-surface-400 text-sm">No upcoming deadlines or interviews.</p>
          <Link
            href="/dashboard/candidate/applications"
            className="text-xs text-brand-400 hover:text-brand-300 mt-2 inline-block"
          >
            View applications →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {upcoming.slice(0, 10).map((event) => (
            <li key={event.id}>
              <Link
                href={
                  event.applicationId
                    ? `/dashboard/candidate/applications?highlight=${event.applicationId}`
                    : '/dashboard/candidate/applications'
                }
                className={cn(
                  'flex gap-3 p-3 rounded-lg border border-transparent hover:border-surface-600 hover:bg-surface-800/80 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-800'
                )}
              >
                <span className="shrink-0 mt-0.5">{eventIcon(event.type)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{event.title}</p>
                  {(event.jobTitle || event.company) && (
                    <p className="text-xs text-surface-400 truncate">
                      {[event.jobTitle, event.company].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="text-xs text-surface-500 mt-0.5">{formatTime(event.at)}</p>
                  {event.note && (
                    <p className="text-xs text-surface-500 mt-1 line-clamp-1">{event.note}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {upcoming.length > 10 && (
        <Link
          href="/dashboard/candidate/applications"
          className="block mt-3 text-center text-xs text-brand-400 hover:text-brand-300"
        >
          View all ({upcoming.length})
        </Link>
      )}
    </div>
  );
}
