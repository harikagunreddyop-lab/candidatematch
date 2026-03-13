'use client';

import type { ReactNode } from 'react';

type BlurredPreviewProps = {
  blurred: boolean;
  children: ReactNode;
};

export function BlurredPreview({ blurred, children }: BlurredPreviewProps) {
  if (!blurred) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none blur-sm opacity-70">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-950/50">
        <p className="text-sm font-medium text-surface-50 mb-1">Preview only on Free</p>
        <p className="text-xs text-surface-300">Upgrade to unlock the full view.</p>
      </div>
    </div>
  );
}

