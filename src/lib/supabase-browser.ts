import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';

const noCacheFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: noCacheFetch } }
  );
}

/**
 * Subscribe to a Supabase Realtime channel with console logging for status
 * and errors. Use instead of bare `.subscribe()` so failures are visible.
 */
export function subscribeWithLog(channel: RealtimeChannel, label?: string): RealtimeChannel {
  const tag = label ?? channel.topic ?? 'unknown';
  return channel.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      // Connected successfully — no-op in production, useful during debugging
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[realtime] ${tag}: subscribed`);
      }
    } else if (status === 'CHANNEL_ERROR') {
      console.error(`[realtime] ${tag}: channel error`, err);
    } else if (status === 'TIMED_OUT') {
      console.warn(`[realtime] ${tag}: timed out`);
    } else if (status === 'CLOSED') {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[realtime] ${tag}: closed`);
      }
    }
  });
}
