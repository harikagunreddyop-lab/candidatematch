'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { Application, UseApplicationsReturn } from '@/types';

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
