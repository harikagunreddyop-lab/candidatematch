'use client';

import { Toaster as SonnerToaster } from 'sonner';

const toastTheme = {
  light: 'dark',
  dark: 'dark',
} as const;

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="top-right"
      toastOptions={{
        className: '!bg-surface-100 !border-surface-300 !text-white !shadow-lg',
        style: {
          background: 'var(--surface-100, #2a2a3a)',
          border: '1px solid var(--surface-300, #4a4a5a)',
          color: '#fff',
        },
      }}
      richColors
      closeButton
      duration={4000}
    />
  );
}

// Re-export toast from sonner so app code can do: import { toast } from '@/lib/toast'
export { toast } from 'sonner';
