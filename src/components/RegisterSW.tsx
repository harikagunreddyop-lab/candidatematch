'use client';

import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    window.navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[PWA] Service worker registered', reg.scope);
        }
      })
      .catch(() => {});
  }, []);
  return null;
}
