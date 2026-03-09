'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Match, UseMatchesReturn } from '@/types';

const DEBUG_ENDPOINT = 'http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50';
const DEBUG_SESSION_ID = 'f6067c';
const DEBUG_RUN_ID = 'candidate-dashboard-run1';

/**
 * Fetches matches via API so free-tier weekly limit is enforced.
 */
export function useMatches(candidateId: string | null): UseMatchesReturn {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMatches = useCallback(async () => {
    if (!candidateId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/candidate/matches', { credentials: 'include' });
      const data = res.ok ? (await res.json()) as { matches?: Match[] } : {};
      const apiMatches = data.matches ?? [];
      const activeOnly = apiMatches.filter((m: any) => {
        const job = Array.isArray(m.job) ? m.job[0] : m.job;
        return !job || job.is_active !== false;
      });
      // #region agent log
      fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H3',location:'src/hooks/useMatches.ts:31',message:'useMatches API result',data:{candidateIdPresent:Boolean(candidateId),responseOk:res.ok,apiCount:apiMatches.length,activeCount:activeOnly.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setMatches(activeOnly);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    if (!candidateId) {
      setMatches([]);
      setLoading(false);
      return;
    }
    loadMatches();
  }, [candidateId, loadMatches]);

  return { matches, loading, refresh: loadMatches };
}
