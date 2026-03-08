'use client';

import { PageTransition } from './PageTransition';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export function DashboardContent({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts();
  return <PageTransition>{children}</PageTransition>;
}
