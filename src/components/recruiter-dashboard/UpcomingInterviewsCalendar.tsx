'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import type { UpcomingInterview } from '@/types/recruiter-dashboard';

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isUpcomingInterview(value: unknown): value is UpcomingInterview {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<UpcomingInterview>;
  return (
    typeof v.id === 'string' &&
    typeof v.scheduled_at === 'string' &&
    typeof v.duration_minutes === 'number' &&
    typeof v.candidate_name === 'string' &&
    typeof v.job_title === 'string' &&
    typeof v.candidate_id === 'string'
  );
}

export function UpcomingInterviewsCalendar() {
  const [interviews, setInterviews] = useState<UpcomingInterview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/recruiter/dashboard/upcoming-interviews')
      .then(async (r) => {
        if (!r.ok) return [] as UpcomingInterview[];
        const data = await r.json();
        const list = Array.isArray(data?.interviews) ? data.interviews.filter(isUpcomingInterview) : [];
        return list as UpcomingInterview[];
      })
      .then((safeInterviews) => setInterviews(safeInterviews))
      .catch(() => setInterviews([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-surface-100 border border-surface-700/60 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-brand-400" />
          Upcoming Interviews
        </h3>
        <div className="h-24 animate-pulse bg-surface-200 rounded" />
      </div>
    );
  }

  if (interviews.length === 0) {
    return (
      <div className="bg-surface-100 border border-surface-700/60 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-brand-400" />
          Upcoming Interviews
        </h3>
        <p className="text-surface-500 text-sm">No upcoming interviews.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-100 border border-surface-700/60 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-surface-700/60 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-brand-400" />
          Upcoming Interviews
        </h3>
        <Link
          href="/dashboard/recruiter/applications?status=interview"
          className="text-sm text-brand-400 hover:text-brand-300"
        >
          View all
        </Link>
      </div>
      <ul className="divide-y divide-surface-700/50 max-h-72 overflow-y-auto">
        {interviews.slice(0, 8).map((inv) => (
          <li key={inv.id}>
            <Link
              href={`/dashboard/recruiter/candidates/${inv.candidate_id}`}
              className="block p-4 hover:bg-surface-200/30 transition-colors"
            >
              <p className="font-medium text-white">{inv.candidate_name}</p>
              <p className="text-sm text-surface-400">{inv.job_title}</p>
              <p className="text-xs text-surface-500 mt-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatTime(inv.scheduled_at)} · {inv.duration_minutes}m
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
