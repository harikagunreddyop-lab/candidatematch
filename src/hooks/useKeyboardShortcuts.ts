'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

/**
 * Global keyboard shortcuts for dashboard:
 * - Cmd+K / Ctrl+K: Focus search (or open global search when implemented)
 * - N: New job when on jobs pages (context-aware)
 * - Escape: Close modals (handled by Modal component)
 */
export function useKeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMac = typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Cmd+K / Ctrl+K: focus first search input or open command palette later
      if (mod && e.key === 'k') {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="Search" i]');
        if (search) {
          search.focus();
          search.select();
        }
        return;
      }

      // N: New job when on jobs list pages (no when inside input/textarea)
      const target = e.target as HTMLElement;
      if (
        e.key === 'n' &&
        !mod &&
        !e.altKey &&
        !target.closest('input, textarea, [contenteditable="true"]')
      ) {
        if (pathname?.includes('/dashboard/recruiter/jobs') && !pathname.includes('/new')) {
          e.preventDefault();
          router.push('/dashboard/recruiter/jobs/new');
        } else if (pathname?.includes('/dashboard/company/jobs') && !pathname.includes('/new')) {
          e.preventDefault();
          router.push('/dashboard/company/jobs/new');
        } else if (pathname?.includes('/dashboard/admin/jobs') && !pathname.includes('/new')) {
          e.preventDefault();
          router.push('/dashboard/admin/jobs');
        }
      }
    },
    [pathname, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
