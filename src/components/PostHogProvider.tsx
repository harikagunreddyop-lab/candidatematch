'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { posthogAnalytics } from '@/lib/analytics-posthog';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) {
      posthogAnalytics.page(pathname);
    }
  }, [pathname]);

  return <>{children}</>;
}
