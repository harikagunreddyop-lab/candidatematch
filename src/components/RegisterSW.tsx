'use client';

import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    window.navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.error('[PWA] Service worker registration failed', err);
        }
      });
  }, []);
  return null;
}
