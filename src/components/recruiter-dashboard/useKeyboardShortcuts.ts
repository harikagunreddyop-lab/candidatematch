'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export const RECRUITER_SHORTCUTS = {
  'g d': { label: 'Go to Dashboard', path: '/dashboard/recruiter' },
  'g p': { label: 'Go to Pipeline', path: '/dashboard/recruiter/pipeline' },
  'g c': { label: 'Go to Candidates', path: '/dashboard/recruiter/candidates' },
  'g j': { label: 'Go to Jobs', path: '/dashboard/recruiter/jobs' },
  'g a': { label: 'Go to Applications', path: '/dashboard/recruiter/applications' },
  'g s': { label: 'Go to Sourcing', path: '/dashboard/recruiter/sourcing' },
  '?': { label: 'Show keyboard shortcuts', key: 'help' },
  Escape: { label: 'Close modals', key: 'escape' },
} as const;

export function useKeyboardShortcuts(options?: {
  onHelp?: () => void;
  onEscape?: () => void;
  onCommandPalette?: () => void;
  enabled?: boolean;
}) {
  const router = useRouter();
  const { onHelp, onEscape, onCommandPalette, enabled = true } = options ?? {};

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      const key = e.key;
      if (key === 'Escape') {
        onEscape?.();
        return;
      }
      if (key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        onHelp?.();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (key === 'k') {
          e.preventDefault();
          onCommandPalette?.();
        }
        return;
      }
      const seq = key.toLowerCase();
      const withG = e.key === 'g' ? 'g ' : e.key.length === 1 ? `g ${seq}` : null;
      const match = withG
        ? Object.entries(RECRUITER_SHORTCUTS).find(
            ([k]) => k === withG || k === seq
          )
        : null;
      if (match) {
        const [, value] = match;
        if ('path' in value) {
          e.preventDefault();
          router.push(value.path);
        }
      }
    },
    [router, onHelp, onEscape, onCommandPalette, enabled]
  );

  useEffect(() => {
    let buffer = '';
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        buffer = 'g ';
        return;
      }
      if (buffer === 'g ' && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        const seq = buffer + e.key.toLowerCase();
        const entry = Object.entries(RECRUITER_SHORTCUTS).find(([k]) => k === seq);
        buffer = '';
        if (entry) {
          const [, value] = entry;
          if ('path' in value) {
            e.preventDefault();
            router.push(value.path);
          }
        }
        return;
      }
      buffer = '';
      handleKeyDown(e);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKeyDown, router]);
}
