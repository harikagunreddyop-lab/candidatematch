'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { Profile } from '@/types';

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
  queryFn: (supabase: ReturnType<typeof createClient>) => Promise<{ data: T | null; error: any }>,
  deps: any[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    setClient(createClient());
  }, []);

  const refetch = useCallback(async () => {
    if (!client) return;
    const c = client;
    setLoading(true);
    setError(null);
    const result = await queryFn(c);
    if (result.error) setError(result.error.message);
    else setData(result.data);
    setLoading(false);
  }, [client, ...deps]);

  useEffect(() => {
    if (client) refetch();
  }, [client, refetch]);

  return { data, loading, error, refetch };
}

export function useToast() {
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, toast, dismiss };
}
