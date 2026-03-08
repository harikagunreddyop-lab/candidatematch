'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { Candidate, UseCandidateReturn } from '@/types';

export function useCandidate(): UseCandidateReturn {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadCandidate = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('candidates')
      .select('*')
      .eq('user_id', session.user.id)
      .single();

    setCandidate((data as Candidate | null) ?? null);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase from createClient() unstable; run once on mount
  }, []);

  useEffect(() => {
    loadCandidate();
  }, [loadCandidate]);

  return { candidate, loading, refresh: loadCandidate };
}
