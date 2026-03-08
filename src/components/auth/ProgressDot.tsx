'use client';

export function ProgressDot({ active, completed }: { active: boolean; completed?: boolean }) {
  return (
    <div
      className={`h-2 rounded-full transition-all duration-300 ${
        completed
          ? 'w-8 bg-brand-400'
          : active
            ? 'w-8 bg-brand-400'
            : 'w-2 bg-surface-600'
      }`}
    />
  );
}
