'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { JobSearchBar, FilterPanel, JobCard, QuickApplyModal, SavedSearchesList, JobComparisonTable, SalaryInsightsWidget, JobCardSkeleton } from '@/components/jobs';
import type { JobSearchParams } from '@/components/jobs/JobSearchBar';
import type { JobCardJob } from '@/components/jobs/JobCard';
import { EmptyState } from '@/components/ui';
import { Briefcase, ChevronLeft, ChevronRight, BookmarkPlus, GitCompare, X, Search, Layers } from 'lucide-react';

const PAGE_SIZE = 20;

export function CandidateJobSearch() {
  const [params, setParams] = useState<JobSearchParams>({});
  const [jobs, setJobs] = useState<JobCardJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [candidateSalaryMin, setCandidateSalaryMin] = useState<number | null>(null);
  const [candidateSalaryMax, setCandidateSalaryMax] = useState<number | null>(null);
  const [defaultResumeId, setDefaultResumeId] = useState<string | null>(null);
  const [applyModalJob, setApplyModalJob] = useState<JobCardJob | null>(null);
  const [compareJobs, setCompareJobs] = useState<JobCardJob[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [saveSearchAlert, setSaveSearchAlert] = useState<string>(''); // '' | 'daily' | 'weekly' | 'instant'
  const [savedSearchesKey, setSavedSearchesKey] = useState(0);
  const [similarForJob, setSimilarForJob] = useState<JobCardJob | null>(null);
  const [similarJobs, setSimilarJobs] = useState<JobCardJob[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  const handleSearch = useCallback((next: JobSearchParams) => {
    setParams((prev) => ({ ...prev, ...next }));
    setPage(1);
  }, []);

  const handleSaveCurrentSearch = async () => {
    const name = saveSearchName.trim() || 'My search';
    const res = await fetch('/api/candidate/saved-searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        search_name: name,
        search_params: {
          query: params.query,
          location: params.location,
          remote_type: params.remote_type,
          salary_min: params.salary_min,
          salary_max: params.salary_max,
          job_type: params.job_type,
          experience_level: params.experience_level,
          skills: params.skills,
          posted_after: params.posted_after,
          posted_days: params.posted_days,
          sort_by: params.sort_by,
        },
        alert_frequency: ['daily', 'weekly', 'instant'].includes(saveSearchAlert) ? saveSearchAlert : null,
      }),
    });
    if (res.ok) {
      setSaveSearchOpen(false);
      setSaveSearchName('');
      setSaveSearchAlert('');
      setSavedSearchesKey((k) => k + 1);
    }
  };

  const buildSearchUrl = useCallback((p: JobSearchParams, pageNum: number) => {
    const u = new URL('/api/jobs/search', 'http://x');
    if (p.query) u.searchParams.set('query', p.query);
    if (p.location) u.searchParams.set('location', p.location);
    if (p.remote_type) u.searchParams.set('remote_type', p.remote_type);
    if (p.salary_min != null) u.searchParams.set('salary_min', String(p.salary_min));
    if (p.salary_max != null) u.searchParams.set('salary_max', String(p.salary_max));
    if (p.job_type?.length) u.searchParams.set('job_type', p.job_type.join(','));
    if (p.experience_level?.length) u.searchParams.set('experience_level', p.experience_level.join(','));
    if (p.skills?.length) u.searchParams.set('skills', p.skills.join(','));
    if (p.posted_after) u.searchParams.set('posted_after', p.posted_after);
    if (p.sort_by) u.searchParams.set('sort_by', p.sort_by);
    u.searchParams.set('page', String(pageNum));
    u.searchParams.set('limit', String(PAGE_SIZE));
    return u.searchParams.toString();
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const queryString = buildSearchUrl(params, page);
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0753dd'},body:JSON.stringify({sessionId:'0753dd',runId:'initial',hypothesisId:'H2_client_request_shape',location:'src/components/jobs/CandidateJobSearch.tsx:93',message:'Client fetchJobs start',data:{page,params,queryString},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const res = await fetch(`/api/jobs/search?${queryString}`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0753dd'},body:JSON.stringify({sessionId:'0753dd',runId:'initial',hypothesisId:'H4_client_response_shape',location:'src/components/jobs/CandidateJobSearch.tsx:97',message:'Client fetchJobs response',data:{total:data?.total ?? null,jobsCount:Array.isArray(data?.jobs)?data.jobs.length:null,remoteTypeParam:params.remote_type ?? null,resultRemoteTypes:Array.isArray(data?.jobs)?Array.from(new Set(data.jobs.map((j: { remote_type?: string | null }) => j?.remote_type ?? null))).slice(0,8):[]},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setJobs(data.jobs ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [params, page, buildSearchUrl]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    (async () => {
      const [savedRes, applicationsRes, resumeRes] = await Promise.all([
        fetch('/api/candidate/saved-jobs', { credentials: 'include' }),
        fetch('/api/applications?limit=500', { credentials: 'include' }),
        fetch('/api/candidate/resume', { credentials: 'include' }),
      ]);
      const savedData = await savedRes.json().catch(() => ({}));
      const applicationsData = await applicationsRes.json().catch(() => ({}));
      const resumesData = await resumeRes.json().catch(() => ({}));
      setSavedJobIds(new Set((savedData.saved_job_ids ?? []) as string[]));
      const appliedIds = (applicationsData.applications ?? []).map((a: { job_id?: string }) => a.job_id).filter(Boolean);
      setAppliedJobIds(new Set(appliedIds));
      const resumes = resumesData.resumes ?? [];
      const defaultResume = resumes.find((r: { is_default?: boolean }) => r.is_default) ?? resumes[0];
      setDefaultResumeId(defaultResume?.id ?? null);
      setCandidateId((resumesData.candidate_id as string) ?? null);
      setCandidateSalaryMin((resumesData.candidate_salary_min as number) ?? null);
      setCandidateSalaryMax((resumesData.candidate_salary_max as number) ?? null);
    })();
  }, []);

  const handleSave = async (jobId: string) => {
    const res = await fetch('/api/candidate/saved-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ job_id: jobId }),
    });
    if (res.ok) setSavedJobIds((prev) => new Set(prev).add(jobId));
  };

  const handleUnsave = async (jobId: string) => {
    const res = await fetch('/api/candidate/saved-jobs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ job_id: jobId }),
    });
    if (res.ok) setSavedJobIds((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
  };

  const handleApplySuccess = () => {
    if (applyModalJob) setAppliedJobIds((prev) => new Set(prev).add(applyModalJob.id));
  };

  const handleCompare = (job: JobCardJob) => {
    setCompareJobs((prev) => {
      const exists = prev.some((j) => j.id === job.id);
      if (exists) return prev.filter((j) => j.id !== job.id);
      if (prev.length >= 3) return [...prev.slice(1), job];
      return [...prev, job];
    });
  };

  const removeFromCompare = (jobId: string) => {
    setCompareJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  const handleSeeSimilar = useCallback((job: JobCardJob) => {
    setSimilarForJob(job);
    setSimilarJobs([]);
    setSimilarLoading(true);
    fetch(`/api/jobs/similar?job_id=${encodeURIComponent(job.id)}&limit=5`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => { setSimilarJobs(data.similar ?? []); })
      .catch(() => setSimilarJobs([]))
      .finally(() => setSimilarLoading(false));
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const startResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endResult = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

  const filterChips: { key: string; label: string }[] = [];
  if (params.remote_type) filterChips.push({ key: 'remote_type', label: `Work: ${params.remote_type}` });
  if (params.salary_min != null && params.salary_min > 0) filterChips.push({ key: 'salary_min', label: `Min $${(params.salary_min / 1000).toFixed(0)}k` });
  if (params.salary_max != null && params.salary_max > 0) filterChips.push({ key: 'salary_max', label: `Max $${(params.salary_max / 1000).toFixed(0)}k` });
  if (params.job_type?.length) filterChips.push({ key: 'job_type', label: params.job_type.join(', ') });
  if (params.experience_level?.length) filterChips.push({ key: 'experience_level', label: params.experience_level.join(', ') });
  if (params.skills?.length) filterChips.push({ key: 'skills', label: `Skills: ${params.skills.slice(0, 2).join(', ')}${params.skills.length > 2 ? '…' : ''}` });
  if (params.posted_days) filterChips.push({ key: 'posted_days', label: `Posted: ${params.posted_days === '1' ? '24h' : params.posted_days === '7' ? '7d' : '30d'}` });
  if (params.sort_by && params.sort_by !== 'relevance') filterChips.push({ key: 'sort_by', label: `Sort: ${params.sort_by}` });

  const removeFilterChip = (key: string) => {
    const next = { ...params };
    if (key === 'remote_type') next.remote_type = undefined;
    else if (key === 'salary_min') next.salary_min = undefined;
    else if (key === 'salary_max') next.salary_max = undefined;
    else if (key === 'job_type') next.job_type = undefined;
    else if (key === 'experience_level') next.experience_level = undefined;
    else if (key === 'skills') next.skills = undefined;
    else if (key === 'posted_days') {
      next.posted_days = undefined;
      next.posted_after = undefined;
    }
    else if (key === 'sort_by') next.sort_by = 'relevance';
    setParams(next);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-surface-bg text-surface-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <div className="relative overflow-hidden rounded-xl border border-surface-300 bg-surface-100 p-3 sm:p-4 shadow-card">
          <Link
            href="/dashboard/candidate"
            className="relative z-10 text-surface-600 hover:text-surface-900 flex items-center gap-1 text-xs mb-2"
          >
            <ChevronLeft size={18} /> Dashboard
          </Link>
          <h1 className="relative z-10 text-xl sm:text-2xl font-bold font-display tracking-tight text-surface-900">Find your next role</h1>
          <p className="relative z-10 mt-0.5 text-xs font-medium text-surface-600">
            {total > 0 ? `${total.toLocaleString()} jobs` : 'Search with filters and get match scores'}
          </p>
          <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full border border-surface-300 bg-surface-200 px-2.5 py-0.5 font-semibold text-surface-700">
              Saved: {savedJobIds.size}
            </span>
            <span className="rounded-full border border-surface-300 bg-surface-200 px-2.5 py-0.5 font-semibold text-surface-700">
              Comparing: {compareJobs.length}/3
            </span>
          </div>

          <div className="relative z-10 mt-2.5 space-y-2 rounded-lg border border-surface-300 bg-surface-50 p-2.5">
            <JobSearchBar
              initialQuery={params.query}
              initialLocation={params.location}
              onSearch={handleSearch}
            />
            <FilterPanel
              params={params}
              onChange={(next) => {
                // #region agent log
                fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0753dd'},body:JSON.stringify({sessionId:'0753dd',runId:'initial',hypothesisId:'H1_filter_state_update',location:'src/components/jobs/CandidateJobSearch.tsx:239',message:'FilterPanel onChange',data:{prevRemoteType:params.remote_type ?? null,nextRemoteType:next.remote_type ?? null,nextParams:next},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                setParams(next);
                setPage(1);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSaveSearchOpen(true)}
                className="text-[11px] text-surface-700 hover:text-surface-900 flex items-center gap-1 rounded-md border border-surface-300 bg-surface-100 px-2 py-1"
              >
                <BookmarkPlus size={14} /> Save this search
              </button>
              {saveSearchOpen && (
                <div className="flex items-center gap-2 flex-wrap rounded-lg border border-surface-300 bg-surface-100 px-2 py-1.5">
                  <input
                    type="text"
                    value={saveSearchName}
                    onChange={(e) => setSaveSearchName(e.target.value)}
                    placeholder="Search name"
                    className="input w-36 border-surface-300 bg-surface-50 px-2 py-1 text-xs font-medium text-surface-900 placeholder:text-surface-500"
                  />
                  <select
                    value={saveSearchAlert}
                    onChange={(e) => setSaveSearchAlert(e.target.value)}
                    className="input border-surface-300 bg-surface-50 px-2 py-1 text-xs font-medium text-surface-900"
                    title="Email alert frequency"
                    aria-label="Alert frequency"
                  >
                    <option value="">No email alerts</option>
                    <option value="instant">Instant (new matches)</option>
                    <option value="daily">Daily digest</option>
                    <option value="weekly">Weekly digest</option>
                  </select>
                  <button type="button" onClick={handleSaveCurrentSearch} className="btn-primary text-xs py-1.5 px-2.5">
                    Save
                  </button>
                  <button type="button" onClick={() => { setSaveSearchOpen(false); setSaveSearchName(''); setSaveSearchAlert(''); }} className="btn-ghost text-xs">
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <SavedSearchesList key={savedSearchesKey} onLoadSearch={(next) => { setParams(next); setPage(1); }} />
            {filterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-surface-700">Active:</span>
                {filterChips.map((chip) => (
                  <span
                    key={chip.key}
                    className="inline-flex items-center gap-1 rounded-full border border-surface-300 bg-surface-100 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-surface-800"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onClick={() => removeFilterChip(chip.key)}
                      className="p-0.5 rounded hover:bg-surface-600 text-surface-400 hover:text-surface-100"
                      aria-label={`Remove ${chip.label}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      
        <div className="py-6">
          {!loading && jobs.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-surface-300 bg-surface-50 px-4 py-3 text-sm">
              <p className="font-semibold text-surface-700">
                Showing <span className="font-semibold text-surface-900">{startResult}-{endResult}</span> of{' '}
                <span className="font-semibold text-surface-900">{total.toLocaleString()}</span> jobs
              </p>
              <p className="text-xs font-semibold text-surface-600">Tip: Compare up to 3 jobs side-by-side</p>
            </div>
          )}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={40} className="text-surface-500" />}
            title="No jobs found"
            description="Try broadening your search or filters. You can remove location, try different keywords, or clear some filters."
            action={
              <div className="flex flex-col items-center gap-2 text-sm text-surface-400">
                <span>Suggestions:</span>
                <ul className="list-disc text-left space-y-1">
                  <li>Use a shorter or more general job title</li>
                  <li>Remove salary or work-type filters to see more results</li>
                  <li>Try a different location or &quot;Remote&quot;</li>
                  <li>Check spelling of keywords and skills</li>
                </ul>
                <button
                  type="button"
                  onClick={() => { setParams({ query: params.query, location: params.location }); setPage(1); }}
                  className="mt-2 btn-ghost text-sm inline-flex items-center gap-1.5"
                >
                  <Search size={14} />
                  Clear filters and search again
                </button>
              </div>
            }
          />
        ) : (
          <>
            <SalaryInsightsWidget
              jobs={jobs}
              candidateSalaryMin={candidateSalaryMin}
              candidateSalaryMax={candidateSalaryMax}
              className="mb-6"
            />
            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isSaved={savedJobIds.has(job.id)}
                  isApplied={appliedJobIds.has(job.id)}
                  isComparing={compareJobs.some((j) => j.id === job.id)}
                  onSave={handleSave}
                  onUnsave={handleUnsave}
                  onApply={(j) => setApplyModalJob(j)}
                  onCompare={handleCompare}
                  onSeeSimilar={handleSeeSimilar}
                />
              ))}
            </div>

            {compareJobs.length >= 2 && (
              <div className="mt-6 p-4 rounded-2xl border border-brand-300 bg-brand-50/60 flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold text-surface-900">
                  <GitCompare size={18} />
                  Comparing {compareJobs.length} jobs
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCompareOpen(true)}
                    className="btn-primary text-sm py-2 px-4"
                  >
                    View comparison
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareJobs([])}
                    className="btn-ghost text-sm py-2 px-4"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {(compareOpen && compareJobs.length >= 2) && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
                <div className="relative w-full max-w-4xl my-8">
                  <JobComparisonTable
                    jobs={compareJobs}
                    onClose={() => setCompareOpen(false)}
                    onRemove={removeFromCompare}
                  />
                </div>
              </div>
            )}

            {similarForJob && (
              <div className="mt-8 rounded-2xl border border-surface-300 bg-surface-50 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-surface-900">
                  <Layers size={18} />
                  Similar to &quot;{similarForJob.title}&quot;
                </h2>
                {similarLoading ? (
                  <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                    {[1, 2].map((i) => (
                      <JobCardSkeleton key={i} />
                    ))}
                  </div>
                ) : similarJobs.length === 0 ? (
                  <p className="text-sm font-semibold text-surface-700">No similar jobs found.</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                    {similarJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        isSaved={savedJobIds.has(job.id)}
                        isApplied={appliedJobIds.has(job.id)}
                        isComparing={compareJobs.some((j) => j.id === job.id)}
                        onSave={handleSave}
                        onUnsave={handleUnsave}
                        onApply={(j) => setApplyModalJob(j)}
                        onCompare={handleCompare}
                        onSeeSimilar={handleSeeSimilar}
                      />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setSimilarForJob(null); setSimilarJobs([]); }}
                  className="mt-3 text-sm font-semibold text-surface-700 hover:text-surface-900"
                >
                  Close similar jobs
                </button>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-8 rounded-xl border border-surface-300 bg-surface-50 px-4 py-3">
                <p className="text-sm font-semibold text-surface-700">
                  Page {page} of {totalPages} · {total} jobs
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-ghost p-2 rounded-lg disabled:opacity-40"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="btn-ghost p-2 rounded-lg disabled:opacity-40"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>

      <QuickApplyModal
        open={!!applyModalJob}
        onClose={() => setApplyModalJob(null)}
        job={applyModalJob}
        candidateId={candidateId}
        defaultResumeId={defaultResumeId}
        onSuccess={handleApplySuccess}
      />
    </div>
  );
}
