'use client';

import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { cn, formatDate } from '@/utils/helpers';
import { getScoreBadgeClasses } from '@/lib/ats-score';

export interface PipelineCardData {
  id?: string;
  candidate_id: string;
  job_id: string;
  _type: 'application' | 'match';
  candidate?: { id: string; full_name?: string; primary_title?: string; location?: string; email?: string };
  job?: { id: string; title?: string; company?: string; location?: string; url?: string };
  fit_score?: number;
  interview_date?: string | null;
  applied_at?: string | null;
  updated_at?: string;
  current_stage_id?: string | null;
}

export interface PipelineCandidateCardProps {
  card: PipelineCardData;
  stageId: string;
  stageColor?: string | null;
  disabled?: boolean;
  onMove?: (card: PipelineCardData, toStageId: string) => void;
  onClick?: (card: PipelineCardData) => void;
}

function scoreColor(score: number) {
  const { bg, text } = getScoreBadgeClasses(score);
  return `${bg} ${text}`;
}

export function PipelineCandidateCard({
  card,
  stageId: _stageId,
  stageColor,
  disabled,
  onMove: _onMove,
  onClick,
}: PipelineCandidateCardProps) {
  const candidate = card.candidate;
  const job = card.job;
  const isMatch = card._type === 'match';

  return (
    <div
      className={cn(
        'rounded-xl p-3 shadow-sm border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/80 hover:shadow-md transition-shadow group',
        !disabled && 'cursor-grab active:cursor-grabbing'
      )}
      onClick={() => onClick?.(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(card);
        }
      }}
    >
      <div className="flex items-start gap-2">
        <div
          className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-500/25 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-sm shrink-0"
          style={stageColor ? { borderLeft: `3px solid ${stageColor}` } : undefined}
        >
          {candidate?.full_name?.[0] || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/dashboard/company/candidates/${card.candidate_id}`}
            className="text-sm font-semibold text-surface-900 dark:text-surface-100 hover:text-brand-600 dark:hover:text-brand-400 leading-tight truncate block"
            onClick={(e) => e.stopPropagation()}
          >
            {candidate?.full_name ?? 'Unknown'}
          </Link>
          <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
            {candidate?.primary_title ?? '—'}
          </p>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-surface-100 dark:border-surface-600">
        <p className="text-xs font-medium text-surface-800 dark:text-surface-200 truncate">
          {job?.title ?? '—'}
        </p>
        <p className="text-[11px] text-surface-500 dark:text-surface-400 truncate">
          {job?.company ?? '—'}
        </p>
      </div>
      {isMatch && card.fit_score != null && (
        <div className="mt-2">
          <span
            className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded',
              scoreColor(card.fit_score)
            )}
          >
            {card.fit_score} fit
          </span>
        </div>
      )}
      {card.interview_date && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-brand-500 dark:text-brand-400">
          <Calendar size={10} /> {formatDate(card.interview_date)}
        </div>
      )}
    </div>
  );
}
