'use client';

import { AlertCircle } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  /** Error message to display */
  error: string;
  /** Optional retry callback */
  retry?: () => void;
  /** Optional title override */
  title?: string;
  className?: string;
}

export function ErrorState({
  error,
  retry,
  title = 'Something went wrong',
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div
        className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 ring-2 ring-red-500/20"
        aria-hidden
      >
        <AlertCircle className="w-8 h-8 text-red-400" aria-hidden />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2 font-display">
        {title}
      </h3>
      <p className="text-surface-400 text-center max-w-md mb-6">{error}</p>
      {retry && (
        <Button
          variant="secondary"
          onClick={retry}
          className="transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Try Again
        </Button>
      )}
    </div>
  );
}
