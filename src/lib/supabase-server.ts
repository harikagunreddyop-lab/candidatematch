import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv, getSupabaseServiceKey } from '@/lib/env';

export function createServerSupabase() {
  const cookieStore = cookies();
  const { url, anonKey } = getSupabasePublicEnv();
  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch (e) {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch (e) {}
        },
      },
    }
  );
}

export function createServiceClient() {
  const { createClient } = require('@supabase/supabase-js');
  const { url } = getSupabasePublicEnv();
  const serviceKey = getSupabaseServiceKey();
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
