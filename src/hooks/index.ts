'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient, subscribeWithLog } from '@/lib/supabase-browser';
import type { Profile } from '@/types';

export { useCandidate } from './useCandidate';
export { useMatches } from './useMatches';
export { useApplications } from './useApplications';

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    setClient(createClient());
  }, []);

  useEffect(() => {
    if (!client) return;
    const c = client;
    let cancelled = false;
    async function load() {
      const { data: { session } } = await c.auth.getSession();
      if (cancelled) return;
      if (!session) { setLoading(false); return; }
      const { data } = await c.from('profiles').select('*').eq('id', session.user.id).single();
      if (cancelled) return;
      setProfile(data ?? null);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [client]);

  return { profile, loading };
}

export function useSupabaseQuery<T>(
  queryFn: (supabase: ReturnType<typeof createClient>) => Promise<{ data: T | null; error: { message?: string } | null }>,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    setClient(createClient());
  }, []);

  const memoizedQueryFn = useCallback(queryFn, [queryFn, ...deps]);

  const refetch = useCallback(async () => {
    if (!client) return;
    const c = client;
    setLoading(true);
    setError(null);
    const result = await memoizedQueryFn(c);
    if (result.error) setError(result.error.message ?? 'Unknown error');
    else setData(result.data);
    setLoading(false);
  }, [client, memoizedQueryFn]);

  useEffect(() => {
    if (client) refetch();
  }, [client, refetch]);

  return { data, loading, error, refetch };
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ReturnType<typeof createClient> | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch('/api/feature-flags', { credentials: 'include' });
      const data = r.ok ? await r.json() : {};
      if (typeof data === 'object' && data !== null && !('error' in data))
        setFlags(data as Record<string, boolean>);
    } catch {
      /* noop */
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Setup supabase client + user id for realtime subscriptions
  useEffect(() => {
    const c = createClient();
    setClient(c);
    c.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    }).catch(() => setUserId(null));
  }, []);

  // Realtime: immediately reflect admin changes to feature flags
  useEffect(() => {
    if (!client || !userId) return;
    const c = client;
    const channel = c
      .channel('feature-flags-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, () => refetch(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_feature_flags', filter: `user_id=eq.${userId}` }, () => refetch(true));
    subscribeWithLog(channel, 'feature-flags');
    return () => { c.removeChannel(channel); };
  }, [client, userId, refetch]);

  // Refetch on window focus so admin changes propagate without full reload
  useEffect(() => {
    const onFocus = () => refetch(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  const has = useCallback((key: string) => flags[key] === true, [flags]);
  return { flags, loading, has, refetch };
}

export type ToastItem = {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  undo?: () => void;
};

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', options?: { undo?: () => void }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type, undo: options?.undo }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), options?.undo ? 6000 : 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, toast, dismiss };
}
