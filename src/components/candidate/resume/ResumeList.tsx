'use client';

import { useState } from 'react';
import {
  FileText,
  Star,
  Trash2,
  BarChart2,
  Sparkles,
  Download,
} from 'lucide-react';
import { cn } from '@/utils/helpers';
import { Spinner, ConfirmDialog } from '@/components/ui';

export interface ResumeRecord {
  id: string;
  file_name: string;
  label?: string | null;
  version_name?: string | null;
  file_type?: string | null;
  ats_score?: number | null;
  is_default?: boolean;
  tags?: string[] | null;
  uploaded_at: string;
}

export interface ResumeListProps {
  resumes: ResumeRecord[];
  onSetDefault: (resumeId: string) => Promise<void>;
  onDelete: (resumeId: string) => Promise<void>;
  onCheckAts: (resumeId: string) => void;
  onOptimize: (resumeId: string) => void;
  onDownload: (resumeId: string) => void;
  loading?: boolean;
  className?: string;
}

export function ResumeList({
  resumes,
  onSetDefault,
  onDelete,
  onCheckAts,
  onOptimize,
  onDownload,
  loading = false,
  className,
}: ResumeListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = async (resumeId: string) => {
    setDeletingId(resumeId);
    try {
      await onDelete(resumeId);
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const handleSetDefault = async (resumeId: string) => {
    setDefaultId(resumeId);
    try {
      await onSetDefault(resumeId);
    } finally {
      setDefaultId(null);
    }
  };

  if (loading) {
    return (
      <div className={cn('flex justify-center py-12', className)}>
        <Spinner size={28} />
      </div>
    );
  }

  if (!resumes.length) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {resumes.map((r) => (
        <div
          key={r.id}
          className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 p-4 flex flex-wrap items-center gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-brand-500/10 dark:bg-brand-500/20 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-surface-900 dark:text-surface-100 truncate">
                {r.version_name || r.label || r.file_name}
              </span>
              {r.is_default && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                  <Star size={10} /> Default
                </span>
              )}
              {r.file_type && (
                <span className="text-xs text-surface-500 dark:text-surface-400 uppercase">{r.file_type}</span>
              )}
            </div>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              {r.file_name}
              {r.uploaded_at && (
                <> · {new Date(r.uploaded_at).toLocaleDateString()}</>
              )}
            </p>
          </div>
          {r.ats_score != null && (
            <div
              className={cn(
                'shrink-0 px-2.5 py-1 rounded-lg text-sm font-semibold tabular-nums',
                r.ats_score >= 80
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200'
                  : r.ats_score >= 60
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                    : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200'
              )}
              title="ATS score"
            >
              {r.ats_score}
            </div>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onDownload(r.id)}
              className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300"
              title="Download"
            >
              <Download size={16} />
            </button>
            {!r.is_default && (
              <button
                type="button"
                onClick={() => handleSetDefault(r.id)}
                disabled={!!defaultId}
                className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 disabled:opacity-50"
                title="Set as default"
              >
                {defaultId === r.id ? <Spinner size={16} /> : <Star size={16} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => onCheckAts(r.id)}
              className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300"
              title="Run ATS check"
            >
              <BarChart2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => onOptimize(r.id)}
              className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300"
              title="AI optimize"
            >
              <Sparkles size={16} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(r.id)}
              disabled={!!deletingId}
              className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50"
              title="Delete"
            >
              {deletingId === r.id ? <Spinner size={16} /> : <Trash2 size={16} />}
            </button>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title="Delete resume"
        message="This will permanently remove this resume. You can upload it again later."
        confirmText="Delete"
        danger
      />
    </div>
  );
}
