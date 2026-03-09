'use client';

import { useState } from 'react';
import { Modal, Spinner } from '@/components/ui';
import type { JobCardJob } from './JobCard';

export interface QuickApplyModalProps {
  open: boolean;
  onClose: () => void;
  job: JobCardJob | null;
  candidateId: string | null;
  defaultResumeId: string | null;
  onSuccess: () => void;
}

export function QuickApplyModal({
  open,
  onClose,
  job,
  candidateId,
  defaultResumeId,
  onSuccess,
}: QuickApplyModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!job || !candidateId) {
      setError('Complete your profile to use one-click apply.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: { candidate_id: string; job_id: string; status: string; candidate_resume_id?: string } = {
        candidate_id: candidateId,
        job_id: job.id,
        status: 'applied',
      };
      if (defaultResumeId) body.candidate_resume_id = defaultResumeId;
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || data.adverse_action_notice?.improvement_tip || 'Apply failed');
        return;
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!job) return null;

  return (
    <Modal open={open} onClose={onClose} title="Quick apply" size="sm">
      <p className="text-sm text-surface-600 dark:text-surface-300 mb-4">
        Apply to <strong>{job.title}</strong> at {job.company} with your profile and
        {defaultResumeId ? ' default resume' : ' no resume attached'}.
      </p>
      {!candidateId && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
          Complete your candidate profile to use one-click apply.
        </p>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={loading || !candidateId}
          className="btn-primary min-w-[100px] flex items-center justify-center gap-2"
        >
          {loading ? <Spinner size={16} /> : null}
          {loading ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </Modal>
  );
}
