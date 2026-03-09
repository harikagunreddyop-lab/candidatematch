'use client';

import { useState } from 'react';
import { CheckSquare, Mail, Tag, Move } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface BulkActionsToolbarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onMoveToStage?: (stageId: string) => void;
  onAddToPool?: (poolId?: string) => void;
  onSendEmail?: () => void;
  stageOptions?: { id: string; stage_name: string }[];
  className?: string;
}

export function BulkActionsToolbar({
  selectedIds,
  onClearSelection,
  onMoveToStage,
  onAddToPool,
  onSendEmail,
  stageOptions = [],
  className,
}: BulkActionsToolbarProps) {
  const [showMove, setShowMove] = useState(false);
  const [_showPool, setShowPool] = useState(false);

  if (selectedIds.length === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-900/20 px-4 py-3',
        className
      )}
    >
      <span className="text-sm font-medium text-surface-800 dark:text-surface-200 flex items-center gap-2">
        <CheckSquare size={18} />
        {selectedIds.length} selected
      </span>
      <button
        type="button"
        onClick={onClearSelection}
        className="text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
      >
        Clear
      </button>
      {stageOptions.length > 0 && onMoveToStage && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMove(!showMove)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 text-sm font-medium text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-600"
          >
            <Move size={14} /> Move to stage
          </button>
          {showMove && (
            <div className="absolute top-full left-0 mt-1 py-1 rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 shadow-lg z-10 min-w-[160px]">
              {stageOptions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onMoveToStage(s.id); setShowMove(false); }}
                  className="block w-full text-left px-3 py-2 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                >
                  {s.stage_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {onAddToPool && (
        <button
          type="button"
          onClick={() => { setShowPool(true); onAddToPool?.(); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 text-sm font-medium text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-600"
        >
          <Tag size={14} /> Add to pool
        </button>
      )}
      {onSendEmail && (
        <button
          type="button"
          onClick={onSendEmail}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 text-sm font-medium text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-600"
        >
          <Mail size={14} /> Email
        </button>
      )}
    </div>
  );
}
