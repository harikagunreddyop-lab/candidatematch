'use client';

import { useState, useCallback } from 'react';
import { PipelineKanbanBoard, PipelineHealthDashboard, PipelineStageManager } from '@/components/company/pipeline';
import { ToastContainer } from '@/components/ui';
import { useToast } from '@/hooks';
import { Settings, LayoutGrid, BarChart3 } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { PipelineCardData } from '@/components/company/pipeline';

export default function CompanyPipelinePage() {
  const [view, setView] = useState<'board' | 'health' | 'stages'>('board');
  const [detailCard, setDetailCard] = useState<PipelineCardData | null>(null);
  const [jobFilter, _setJobFilter] = useState<string | undefined>(undefined);
  const { toasts, dismiss } = useToast();

  const handleCardClick = useCallback((card: PipelineCardData) => {
    setDetailCard(card);
  }, []);

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">
            Pipeline
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Drag candidates between stages · AI ranking & health insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('board')}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              view === 'board'
                ? 'bg-brand-500 text-white'
                : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700'
            )}
          >
            <LayoutGrid size={18} /> Board
          </button>
          <button
            type="button"
            onClick={() => setView('health')}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              view === 'health'
                ? 'bg-brand-500 text-white'
                : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700'
            )}
          >
            <BarChart3 size={18} /> Health
          </button>
          <button
            type="button"
            onClick={() => setView('stages')}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              view === 'stages'
                ? 'bg-brand-500 text-white'
                : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700'
            )}
          >
            <Settings size={18} /> Stages
          </button>
        </div>
      </div>

      {view === 'board' && (
        <PipelineKanbanBoard
          jobId={jobFilter}
          onCardClick={handleCardClick}
          className="min-h-[70vh]"
        />
      )}

      {view === 'health' && (
        <div className="max-w-4xl">
          <PipelineHealthDashboard jobId={jobFilter} />
        </div>
      )}

      {view === 'stages' && (
        <div className="max-w-xl">
          <PipelineStageManager />
        </div>
      )}

      {detailCard && (
        <DetailModal
          card={detailCard}
          onClose={() => setDetailCard(null)}
        />
      )}
    </div>
  );
}

function DetailModal({
  card,
  onClose,
}: {
  card: PipelineCardData;
  onClose: () => void;
}) {
  const candidate = card.candidate;
  const job = card.job;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100">
          {candidate?.full_name ?? 'Candidate'}
        </h2>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
          {candidate?.primary_title} {candidate?.location && `· ${candidate.location}`}
        </p>
        <div className="mt-4 pt-4 border-t border-surface-200 dark:border-surface-600">
          <p className="text-sm font-medium text-surface-700 dark:text-surface-300">
            Application: {job?.title ?? '—'}
          </p>
          <p className="text-xs text-surface-500 dark:text-surface-400">{job?.company}</p>
        </div>
        <div className="mt-4 flex gap-2">
          <a
            href={`/dashboard/company/candidates/${card.candidate_id}`}
            className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600"
          >
            View profile
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-300 text-sm font-medium hover:bg-surface-100 dark:hover:bg-surface-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
