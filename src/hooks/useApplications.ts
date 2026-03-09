'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { Application, UseApplicationsReturn } from '@/types';

const DEBUG_ENDPOINT = 'http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50';
const DEBUG_SESSION_ID = 'f6067c';
const DEBUG_RUN_ID = 'candidate-dashboard-run1';

export function useApplications(candidateId: string | null): UseApplicationsReturn {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadApplications = useCallback(async () => {
    if (!candidateId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('applications')
      .select(
        `
        *,
        job:jobs(id, title, company)
      `
      )
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(10);

    // #region agent log
    fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H3',location:'src/hooks/useApplications.ts:35',message:'useApplications query result',data:{candidateIdPresent:Boolean(candidateId),count:Array.isArray(data)?data.length:0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    setApplications((data as Application[] | null) ?? []);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase unstable; load keyed by candidateId
  }, [candidateId]);

  useEffect(() => {
    if (!candidateId) {
      setApplications([]);
      setLoading(false);
      return;
    }
    loadApplications();
  }, [candidateId, loadApplications]);

  return { applications, loading, refresh: loadApplications };
}
