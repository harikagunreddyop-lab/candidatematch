'use client';

import Link from 'next/link';
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Phone,
  Building2,
  User,
  ExternalLink,
  Copy,
  Check,
  Mail,
  FileText,
} from 'lucide-react';
import { useState } from 'react';
import {
  formatDateTime,
  formatTime,
  addMinutes,
  countdownTo,
  INTERVIEW_TYPE_LABELS,
  OUTCOME_LABELS,
} from '@/lib/interview-utils';
import type { Interview } from '@/types/interviews';
import { cn } from '@/utils/helpers';

function getJob(interview: Interview) {
  const j = interview.job;
  if (!j) return null;
  return Array.isArray(j) ? j[0] ?? null : j;
}

interface InterviewCardProps {
  interview: Interview;
  showCountdown?: boolean;
  onAddToCalendar?: (interview: Interview) => void;
  onMarkThankYou?: (interview: Interview) => void;
  compact?: boolean;
}

export function InterviewCard({
  interview,
  showCountdown = true,
  onAddToCalendar,
  onMarkThankYou,
  compact = false,
}: InterviewCardProps) {
  const [copied, setCopied] = useState(false);
  const job = getJob(interview);
  const isUpcoming = new Date(interview.scheduled_at) > new Date();
  const endAt = addMinutes(interview.scheduled_at, interview.duration_minutes || 60);

  const typeIcon =
    interview.interview_type === 'video' ? (
      <Video size={14} />
    ) : interview.interview_type === 'phone' ? (
      <Phone size={14} />
    ) : (
      <Building2 size={14} />
    );

  const copyLink = () => {
    if (interview.virtual_meeting_link) {
      navigator.clipboard.writeText(interview.virtual_meeting_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (compact) {
    return (
      <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-brand-500/20 dark:bg-brand-500/30 flex items-center justify-center text-brand-600 dark:text-brand-400 shrink-0">
          {typeIcon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-surface-900 dark:text-surface-100 truncate">{job?.title ?? 'Interview'}</p>
          <p className="text-sm text-surface-500 dark:text-surface-400 truncate">{job?.company}</p>
          <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">
            {formatDateTime(interview.scheduled_at)}
          </p>
        </div>
        {isUpcoming && showCountdown && (
          <span className="text-xs font-medium text-brand-600 dark:text-brand-400 shrink-0">
            {countdownTo(interview.scheduled_at)}
          </span>
        )}
        <Link
          href={`/dashboard/candidate/interview-prep?interviewId=${interview.id}`}
          className="btn-secondary text-xs py-2 px-3 shrink-0"
        >
          Prep
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 p-5 sm:p-6 space-y-4 shadow-sm"
      role="article"
      aria-label={`Interview: ${job?.title} at ${job?.company}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100">{job?.title ?? 'Interview'}</h3>
          <p className="text-surface-500 dark:text-surface-400">{job?.company}</p>
          {interview.interview_type && (
            <span className="inline-flex items-center gap-1 mt-1 text-xs text-surface-500 dark:text-surface-400">
              {typeIcon}
              {INTERVIEW_TYPE_LABELS[interview.interview_type] ?? interview.interview_type}
            </span>
          )}
        </div>
        {isUpcoming && showCountdown && (
          <div className="text-right">
            <p className="text-xs text-surface-500 dark:text-surface-400">Starts in</p>
            <p className="text-lg font-semibold text-brand-600 dark:text-brand-400">
              {countdownTo(interview.scheduled_at)}
            </p>
          </div>
        )}
        {!isUpcoming && interview.outcome && (
          <span
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium',
              interview.outcome === 'passed' && 'bg-green-500/20 text-green-700 dark:text-green-400',
              interview.outcome === 'rejected' && 'bg-red-500/20 text-red-700 dark:text-red-400',
              interview.outcome === 'pending' && 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
            )}
          >
            {OUTCOME_LABELS[interview.outcome] ?? interview.outcome}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-surface-600 dark:text-surface-300">
          <Calendar size={16} className="shrink-0 text-surface-400" />
          {formatDateTime(interview.scheduled_at)}
        </div>
        <div className="flex items-center gap-2 text-surface-600 dark:text-surface-300">
          <Clock size={16} className="shrink-0 text-surface-400" />
          {formatTime(interview.scheduled_at)} – {formatTime(endAt)} ({interview.duration_minutes || 60} min)
        </div>
        {interview.location && (
          <div className="flex items-center gap-2 text-surface-600 dark:text-surface-300 sm:col-span-2">
            <MapPin size={16} className="shrink-0 text-surface-400" />
            {interview.location}
          </div>
        )}
        {interview.interviewer_name && (
          <div className="flex items-center gap-2 text-surface-600 dark:text-surface-300">
            <User size={16} className="shrink-0 text-surface-400" />
            {interview.interviewer_name}
            {interview.interviewer_title && `, ${interview.interviewer_title}`}
          </div>
        )}
      </div>

      {interview.virtual_meeting_link && (
        <div className="flex items-center gap-2">
          <a
            href={interview.virtual_meeting_link}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2"
          >
            <Video size={14} />
            Join meeting
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="btn-ghost p-2 rounded-lg text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
            title="Copy link"
            aria-label="Copy meeting link"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      )}

      {interview.preparation_notes && (
        <div className="pt-3 border-t border-surface-200 dark:border-surface-700">
          <p className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Prep notes</p>
          <p className="text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap">
            {interview.preparation_notes}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Link
          href={`/dashboard/candidate/interview-prep?interviewId=${interview.id}`}
          className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2"
        >
          <FileText size={14} />
          Interview prep
        </Link>
        {onAddToCalendar && isUpcoming && (
          <button
            type="button"
            onClick={() => onAddToCalendar(interview)}
            className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            <Calendar size={14} />
            Add to calendar
          </button>
        )}
        {onMarkThankYou && !isUpcoming && !interview.thank_you_sent && (
          <button
            type="button"
            onClick={() => onMarkThankYou(interview)}
            className="btn-ghost text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            <Mail size={14} />
            Send thank you
          </button>
        )}
        {job?.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            <ExternalLink size={14} />
            Job posting
          </a>
        )}
      </div>
    </div>
  );
}
