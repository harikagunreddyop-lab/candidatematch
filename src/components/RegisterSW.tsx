'use client';

import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isProduction || isLocalhost) {
      window.navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister();
        });
      }).catch(() => {});
      return;
    }
    window.navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => {})
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.error('[PWA] Service worker registration failed', err);
        }
      });
  }, []);
  return null;
}
