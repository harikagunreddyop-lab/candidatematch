'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';

export default function AuthCompletePage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const run = async () => {
      for (let i = 0; i < 5; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && mounted) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
          const role = profile?.role;
          const dest = role === 'admin' ? '/dashboard/admin' : role === 'recruiter' ? '/dashboard/recruiter' : '/dashboard/candidate';
          setStatus('ok');
          router.replace(dest);
          return;
        }
        await new Promise(r => setTimeout(r, 200));
      }
      if (mounted) {
        setStatus('error');
        setTimeout(() => router.replace('/?error=auth'), 1500);
      }
    };

    run();
    return () => { mounted = false; };
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-50 dark:bg-surface-900 px-4">
      {status === 'loading' && (
        <>
          <Spinner size={32} className="text-brand-500 mb-4" />
          <p className="text-sm text-surface-500 dark:text-surface-400">Completing sign in…</p>
        </>
      )}
      {status === 'error' && (
        <p className="text-sm text-surface-500 dark:text-surface-400">Sign-in failed. Redirecting…</p>
      )}
    </div>
  );
}
