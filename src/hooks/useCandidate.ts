'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { Candidate, UseCandidateReturn } from '@/types';

const DEBUG_ENDPOINT = 'http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50';
const DEBUG_SESSION_ID = 'f6067c';
const DEBUG_RUN_ID = 'candidate-dashboard-run1';

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

    const [{ data: candidateRow }, { data: profile }] = await Promise.all([
      supabase
        .from('candidates')
        .select('*')
        .eq('user_id', session.user.id)
        .single(),
      supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', session.user.id)
        .maybeSingle(),
    ]);

    // #region agent log
    fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H1',location:'src/hooks/useCandidate.ts:29',message:'useCandidate load result',data:{sessionPresent:Boolean(session),candidateFound:Boolean(candidateRow),subscriptionTier:profile?.subscription_tier??null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const merged: Candidate | null = candidateRow
      ? ({
          ...(candidateRow as Candidate),
          subscription_tier: (profile?.subscription_tier as Candidate['subscription_tier']) ?? (candidateRow as any).subscription_tier ?? 'free',
        } as Candidate)
      : null;

    setCandidate(merged);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase from createClient() unstable; run once on mount
  }, []);

  useEffect(() => {
    loadCandidate();
  }, [loadCandidate]);

  return { candidate, loading, refresh: loadCandidate };
}
