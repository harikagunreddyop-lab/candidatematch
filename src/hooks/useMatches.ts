'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Match, UseMatchesReturn } from '@/types';

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
      setMatches(data.matches ?? []);
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
