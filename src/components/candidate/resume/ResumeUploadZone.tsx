'use client';

import { useCallback, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { cn } from '@/utils/helpers';

const ACCEPT = 'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt';
const MAX_MB = 10;

export interface ResumeUploadZoneProps {
  onUpload: (file: File, versionName?: string, setDefault?: boolean) => Promise<void>;
  disabled?: boolean;
  maxResumes?: number;
  currentCount?: number;
  className?: string;
}

export function ResumeUploadZone({
  onUpload,
  disabled = false,
  maxResumes = 5,
  currentCount = 0,
  className,
}: ResumeUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback((file: File): string | null => {
    const type = file.type;
    const valid =
      type === 'application/pdf' ||
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      type === 'text/plain';
    if (!valid) return 'Only PDF, DOCX, and TXT files are allowed.';
    const mb = file.size / (1024 * 1024);
    if (mb > MAX_MB) return `File must be under ${MAX_MB}MB.`;
    if (currentCount >= maxResumes) return `Maximum ${maxResumes} resumes. Delete one first.`;
    return null;
  }, [currentCount, maxResumes]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setError(null);
      const file = files[0];
      const err = validate(file);
      if (err) {
        setError(err);
        return;
      }
      setUploading(true);
      try {
        await onUpload(file);
      } catch (e: any) {
        setError(e?.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [onUpload, validate]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled || uploading) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, uploading, handleFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      e.target.value = '';
    },
    [handleFiles]
  );

  return (
    <div className={cn('space-y-2', className)}>
      <label
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer',
          dragActive && 'border-brand-500 bg-brand-500/10',
          !dragActive && 'border-surface-300 dark:border-surface-600 hover:border-surface-400 dark:hover:border-surface-500',
          (disabled || uploading) && 'pointer-events-none opacity-60'
        )}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <input
          type="file"
          accept={ACCEPT}
          onChange={onInputChange}
          disabled={disabled || uploading}
          className="sr-only"
          aria-label="Upload resume"
        />
        {uploading ? (
          <span className="text-sm text-surface-600 dark:text-surface-300">Uploading & analyzing…</span>
        ) : (
          <>
            <Upload className="w-10 h-10 text-surface-400 dark:text-surface-500 mb-2" />
            <span className="text-sm font-medium text-surface-700 dark:text-surface-200">
              Drag and drop your resume, or click to browse
            </span>
            <span className="text-xs text-surface-500 dark:text-surface-400 mt-1">
              PDF, DOCX, or TXT · Max {MAX_MB}MB · Up to {maxResumes} resumes
            </span>
          </>
        )}
      </label>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5" role="alert">
          <FileText size={14} /> {error}
        </p>
      )}
    </div>
  );
}
