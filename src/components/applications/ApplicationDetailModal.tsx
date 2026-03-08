'use client';

import { useState, useEffect } from 'react';
import {
  Loader2,
  Building2,
  Calendar,
  Clock,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { formatDate, formatRelative } from '@/utils/helpers';
import { Modal } from '@/components/ui';
import type { Application } from '@/types/applications';
import { getApplicationJob, daysInStatus } from '@/types/applications';

const STATUS_LABELS: Record<string, string> = {
  ready: 'Ready',
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export interface ApplicationDetailModalProps {
  application: Application | null;
  open: boolean;
  onClose: () => void;
}

export function ApplicationDetailModal({
  application,
  open,
  onClose,
}: ApplicationDetailModalProps) {
  const [timeline, setTimeline] = useState<Array<{ id: string; from_status?: string; to_status: string; notes?: string; created_at: string }>>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  useEffect(() => {
    if (!open || !application) return;
    setLoadingTimeline(true);
    fetch(`/api/applications/timeline?application_id=${application.id}`)
      .then((r) => r.json())
      .then((data) => {
        setTimeline(data.timeline ?? []);
      })
      .finally(() => setLoadingTimeline(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when open or application id changes
  }, [open, application?.id]);

  if (!application) return null;

  const job = getApplicationJob(application);
  const days = application.days_in_status ?? daysInStatus(application.updated_at);

  return (
    <Modal open={open} onClose={onClose} title="Application details" size="lg">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-surface-100">{job?.title || 'Application'}</h2>
          <p className="text-surface-400 flex items-center gap-1.5 mt-0.5">
            <Building2 className="w-4 h-4" />
            {job?.company || '—'}
          </p>
          {job?.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 mt-2"
            >
              View job posting <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <span className="px-2.5 py-1 rounded-lg bg-surface-700 text-surface-200">
            {STATUS_LABELS[application.status] || application.status}
          </span>
          {application.applied_at && (
            <span className="text-surface-400">Applied {formatRelative(application.applied_at)}</span>
          )}
          {days > 0 && (
            <span className="text-surface-400">{days} days in current stage</span>
          )}
          {application.interview_date && (
            <span className="flex items-center gap-1 text-brand-400">
              <Calendar className="w-4 h-4" />
              Interview {formatDate(application.interview_date)}
            </span>
          )}
        </div>

        {application.next_action_required && (
          <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/30">
            <p className="text-sm font-medium text-brand-200">Next action</p>
            <p className="text-surface-200">{application.next_action_required}</p>
            {application.next_action_due && (
              <p className="text-xs text-surface-400 mt-1">Due {formatDate(application.next_action_due)}</p>
            )}
          </div>
        )}

        {(application.candidate_notes || application.notes) && (
          <div>
            <h3 className="text-sm font-semibold text-surface-200 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Notes
            </h3>
            <div className="text-sm text-surface-300 space-y-2">
              {application.candidate_notes && <p>{application.candidate_notes}</p>}
              {application.notes && <p className="text-surface-400">{application.notes}</p>}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-surface-200 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Status timeline
          </h3>
          {loadingTimeline ? (
            <div className="flex items-center gap-2 text-surface-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : timeline.length > 0 ? (
            <ul className="space-y-2">
              {timeline.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 text-sm">
                  <span className="text-surface-500 shrink-0 w-24">{formatDate(entry.created_at)}</span>
                  <span className="text-surface-300">
                    {entry.from_status ? `${entry.from_status} → ` : ''}{entry.to_status}
                    {entry.notes && ` — ${entry.notes}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-surface-500">No timeline entries yet.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
