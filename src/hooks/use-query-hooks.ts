/**
 * React Query hooks for server state: jobs, candidates, matches, applications.
 * Invalidate on mutations; use from dashboard pages.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const STALE_TIME = 60 * 1000; // 1 min

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

// ── Applications ─────────────────────────────────────────────────────────────
// GET /api/applications with query params (candidate_id, job_id, status) must return { applications: [] }.
// If your API only has POST/PATCH, use Supabase in the page or add a GET handler.

export function useApplications(params?: { candidate_id?: string; job_id?: string; status?: string }) {
  const search = new URLSearchParams();
  if (params?.candidate_id) search.set('candidate_id', params.candidate_id);
  if (params?.job_id) search.set('job_id', params.job_id);
  if (params?.status) search.set('status', params.status);
  const query = search.toString();
  const url = query ? `/api/applications?${query}` : '/api/applications';
  return useQuery({
    queryKey: ['applications', params ?? {}],
    queryFn: () => fetchJson<{ applications?: unknown[] }>(url).then((r) => r.applications ?? []),
    staleTime: STALE_TIME,
    enabled: true,
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; status?: string; notes?: string }) =>
      fetchJson<unknown>('/api/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

// ── Market jobs (public list) ────────────────────────────────────────────────

export function useMarketJobs(params?: { skill?: string; region?: string }) {
  const search = new URLSearchParams();
  if (params?.skill) search.set('skill', params.skill);
  if (params?.region) search.set('region', params.region);
  const query = search.toString();
  const url = query ? `/api/market/jobs?${query}` : '/api/market/jobs';
  return useQuery({
    queryKey: ['market', 'jobs', params ?? {}],
    queryFn: () => fetchJson<{ results?: unknown[] }>(url).then((r) => r.results ?? []),
    staleTime: STALE_TIME,
  });
}

// ── Candidate matches ───────────────────────────────────────────────────────

export function useCandidateMatches() {
  return useQuery({
    queryKey: ['candidate', 'matches'],
    queryFn: () =>
      fetchJson<{ matches?: unknown[]; limitReached?: boolean; usedThisWeek?: number; limit?: number }>(
        '/api/candidate/matches'
      ),
    staleTime: STALE_TIME,
  });
}

// ── Company jobs ─────────────────────────────────────────────────────────────
// GET /api/companies/jobs?company_id= must return { jobs: [] }. Add GET handler if missing.

export function useCompanyJobs(companyId: string | null) {
  const enabled = !!companyId;
  return useQuery({
    queryKey: ['company', 'jobs', companyId],
    queryFn: () =>
      fetchJson<{ jobs?: unknown[] }>(`/api/companies/jobs?company_id=${companyId}`).then((r) => r.jobs ?? []),
    staleTime: STALE_TIME,
    enabled,
  });
}
