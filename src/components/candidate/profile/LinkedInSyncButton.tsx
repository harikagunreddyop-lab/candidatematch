'use client';

import { useState } from 'react';
import { Linkedin, Loader2, RefreshCw, CheckCircle } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface LinkedInSyncButtonProps {
  lastSyncedAt: string | null;
  linkedinSyncEnabled: boolean;
  disabled?: boolean;
  className?: string;
}

export function LinkedInSyncButton({
  lastSyncedAt,
  linkedinSyncEnabled,
  disabled,
  className,
}: LinkedInSyncButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    if (loading || disabled) return;
    setLoading(true);
    window.location.href = '/api/candidate/profile/linkedin/auth';
  };

  const lastSyncText = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className={cn(
        'rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 p-6',
        className
      )}
      role="region"
      aria-label="LinkedIn import"
    >
      <div className="flex items-center gap-2 mb-3">
        <Linkedin className="w-5 h-5 text-[#0A66C2]" aria-hidden />
        <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100">
          LinkedIn
        </h3>
      </div>
      <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">
        Import your name and sync status from LinkedIn. Re-sync anytime to update.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0A66C2] hover:bg-[#004182] text-white text-sm font-medium disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : linkedinSyncEnabled && lastSyncedAt ? (
          <RefreshCw className="w-4 h-4" aria-hidden />
        ) : (
          <Linkedin className="w-4 h-4" aria-hidden />
        )}
        {loading
          ? 'Redirecting...'
          : linkedinSyncEnabled && lastSyncedAt
            ? 'Re-sync from LinkedIn'
            : 'Import from LinkedIn'}
      </button>
      {lastSyncText && (
        <p className="flex items-center gap-1.5 mt-3 text-xs text-surface-500 dark:text-surface-400">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden />
          Last synced: {lastSyncText}
        </p>
      )}
    </div>
  );
}
