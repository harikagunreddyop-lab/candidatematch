'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { EmptyState, Spinner } from '@/components/ui';
import { BarChart2, Target, Star, AlertCircle, Brain, X, User, FileText, Zap, Lightbulb } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { getScoreBadgeClasses, SCORE_APPLY_OK } from '@/lib/ats-score';

function parseMatchReason(reason: string) {
  const parts = (reason || '').split('|').map(s => s.trim());
  return {
    strength: parts.find(p => p.startsWith('[STRENGTH]'))?.replace('[STRENGTH]', '').trim() || '',
    gap: parts.find(p => p.startsWith('[GAP]'))?.replace('[GAP]', '').trim() || '',
    risk: parts.find(p => p.startsWith('[RISK]'))?.replace('[RISK]', '').trim() || '',
  };
}

function ATSScoreBadge({ score, decision }: { score: number; decision?: string }) {
  const { bg, text } = getScoreBadgeClasses(score);
  return (
    <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 ring-1', bg, text)}>
      <span className="text-base font-bold tabular-nums">{score}</span>
      <span className="font-medium">{decision ?? (score >= SCORE_APPLY_OK ? 'Strong match' : score >= 75 ? 'Moderate' : 'Low')}</span>
    </div>
  );
}

export default function CandidateSkillReportPage() {
  const supabase = createClient();
  const [candidate, setCandidate] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [resumes, setResumes] = useState<{ id: string; label: string; file_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [briefJobId, setBriefJobId] = useState<string | null>(null);
  const [briefText, setBriefText] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: cand } = await supabase.from('candidates').select('*').eq('user_id', session.user.id).single();
      if (!cand) { setNotLinked(true); setLoading(false); return; }
      setCandidate(cand);
      const [mchRes, resumesRes] = await Promise.all([
        supabase.from('candidate_job_matches')
          .select('*, job:jobs(id, title, company, location)')
          .eq('candidate_id', cand.id)
          .order('fit_score', { ascending: false }),
        fetch(`/api/candidate-resumes?candidate_id=${cand.id}`).then(r => r.json()),
      ]);
      setMatches(mchRes.data || []);
      setResumes((resumesRes.resumes || []).map((r: any) => ({ id: r.id, label: r.label || r.file_name || 'Resume', file_name: r.file_name || '' })));
      setLoading(false);
    }
    load();
  }, [supabase]);

  const matchedFreq: Record<string, number> = {};
  const missingFreq: Record<string, number> = {};
  for (const m of matches) {
    for (const k of (m.matched_keywords || []) as string[]) {
      matchedFreq[k] = (matchedFreq[k] || 0) + 1;
    }
    for (const k of (m.missing_keywords || []) as string[]) {
      missingFreq[k] = (missingFreq[k] || 0) + 1;
    }
  }
  const profileStrengths = Object.entries(matchedFreq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k);
  const whatToAdd = Object.entries(missingFreq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  const bestFitRoles = matches.slice(0, 10);
  const resumeAnalysis = resumes.map(r => {
    const forResume = matches.filter((m: any) => m.best_resume_id === r.id);
    const kw: Record<string, number> = {};
    for (const m of forResume) {
      for (const k of (m.matched_keywords || []) as string[]) {
        kw[k] = (kw[k] || 0) + 1;
      }
    }
    const strongIn = Object.entries(kw).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([x]) => x);
    const bestFor = forResume.map((m: any) => ({ title: m.job?.title, company: m.job?.company, score: m.fit_score })).sort((a: any, b: any) => (b.score || 0) - (a.score || 0)).slice(0, 5);
    return { resume: r, forResume, strongIn, bestFor };
  });
  const profileOnlyMatches = matches.filter((m: any) => !m.best_resume_id);

  const generateJobBrief = async (jobId: string) => {
    setBriefJobId(jobId);
    setBriefText(null);
    setBriefError(null);
    setBriefLoading(true);
    try {
      const res = await fetch('/api/candidate-job-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate brief');
      setBriefText(data.brief);
    } catch (e: any) {
      setBriefError(e.message);
    }
    setBriefLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (notLinked) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center px-4">
      <p className="text-sm text-surface-500 dark:text-surface-300">Your account isn&apos;t linked to a candidate profile yet. Contact your recruiter.</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
        <h1 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-1 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-brand-500/10 dark:bg-brand-500/20 flex items-center justify-center"><BarChart2 size={16} className="text-brand-600 dark:text-brand-400" /></span>
          Skill report
        </h1>
        <p className="text-xs text-surface-500 dark:text-surface-400 mb-6">Why your profile gets the scores it does — what matched and what’s missing for each role.</p>

        {matches.length === 0 ? (
          <EmptyState icon={<Target size={24} />} title="No matches yet" description="Run matching to see why you score high or low for each role. Your recruiter will add jobs and run the engine." />
        ) : (
          <>
            {/* Profile analysis */}
            <div className="mb-8 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-gradient-to-br from-brand-50/50 to-white dark:from-brand-500/5 dark:to-surface-800 p-5">
              <h4 className="text-xs font-semibold text-brand-700 dark:text-brand-300 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <User size={12} /> Profile analysis
              </h4>
              <p className="text-xs text-surface-600 dark:text-surface-300 mb-4">What your profile is strong at, best fit roles, and what to add — derived from your match data.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-2">Strong in</p>
                  {profileStrengths.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {profileStrengths.map((k, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-lg bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-medium">✓ {k}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-surface-500 dark:text-surface-400">No keyword data yet. More matches will populate this.</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-brand-700 dark:text-brand-400 uppercase tracking-wide mb-2">Best fit roles</p>
                  {bestFitRoles.length > 0 ? (
                    <ul className="space-y-1 text-xs text-surface-700 dark:text-surface-200">
                      {bestFitRoles.map((m: any, i: number) => (
                        <li key={m.id} className="flex items-center gap-2">
                          <span className={cn('shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold', getScoreBadgeClasses(m.fit_score).bg, getScoreBadgeClasses(m.fit_score).text)}>{m.fit_score}</span>
                          <span className="truncate">{m.job?.title} at {m.job?.company}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-surface-500 dark:text-surface-400">No matches yet.</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2">What to add or highlight</p>
                  {whatToAdd.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {whatToAdd.map((k, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-lg bg-amber-500/15 dark:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-xs font-medium">+ {k}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-surface-500 dark:text-surface-400">No major gaps identified across matches.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Resume analysis */}
            {(resumes.length > 0 || profileOnlyMatches.length > 0) && (
              <div className="mb-8 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-700/30 p-5">
                <h4 className="text-xs font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <FileText size={12} /> Resume analysis
                </h4>
                <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">What each resume is strong at and which roles it fits best.</p>
                <div className="space-y-4">
                  {resumeAnalysis.filter(ra => ra.forResume.length > 0).map(ra => (
                    <div key={ra.resume.id} className="rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 p-4">
                      <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-2 flex items-center gap-2">
                        <FileText size={14} className="text-brand-500" /> {ra.resume.label}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="font-medium text-surface-600 dark:text-surface-300 mb-1">Strong in</p>
                          <div className="flex flex-wrap gap-1">
                            {ra.strongIn.length > 0 ? ra.strongIn.map((k, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300">✓ {k}</span>
                            )) : <span className="text-surface-400 dark:text-surface-500">—</span>}
                          </div>
                        </div>
                        <div>
                          <p className="font-medium text-surface-600 dark:text-surface-300 mb-1">Best for</p>
                          <ul className="space-y-0.5">
                            {ra.bestFor.map((b: any, i: number) => (
                              <li key={i} className="truncate">{b.title} at {b.company} ({b.score})</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <p className="text-[10px] text-surface-400 dark:text-surface-500 mt-2">Used as best match for {ra.forResume.length} job{ra.forResume.length !== 1 ? 's' : ''}.</p>
                    </div>
                  ))}
                  {profileOnlyMatches.length > 0 && (
                    <div className="rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 p-4">
                      <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-2 flex items-center gap-2">
                        <Zap size={14} className="text-amber-500" /> Profile-only (no resume)
                      </p>
                      <p className="text-xs text-surface-500 dark:text-surface-400">{profileOnlyMatches.length} match{profileOnlyMatches.length !== 1 ? 'es' : ''} scored using your profile only. Upload a resume to improve scores for these roles.</p>
                    </div>
                  )}
                  {resumeAnalysis.every(ra => ra.forResume.length === 0) && profileOnlyMatches.length === 0 && resumes.length > 0 && (
                    <p className="text-xs text-surface-500 dark:text-surface-400">Match data doesn’t yet indicate which resume was used per job. Run matching again after jobs are added.</p>
                  )}
                </div>
              </div>
            )}

            <div className="mb-8">
              <h4 className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Star size={12} className="text-emerald-500" /> Why your best matches score high
              </h4>
              <div className="space-y-4">
                {matches.filter(m => m.fit_score >= SCORE_APPLY_OK).slice(0, 5).map(m => {
                  const reason = parseMatchReason(m.match_reason);
                  const matchedKw = (m.matched_keywords || []) as string[];
                  const missingKw = (m.missing_keywords || []) as string[];
                  return (
                    <div key={m.id} className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-700/30 p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <p className="font-semibold text-surface-900 dark:text-surface-100">{m.job?.title} · {m.job?.company}</p>
                          <ATSScoreBadge score={m.fit_score} decision="Strong match" />
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="font-medium text-emerald-700 dark:text-emerald-300 mb-1">What’s working</p>
                          {reason.strength && <p className="text-surface-700 dark:text-surface-200">{reason.strength}</p>}
                          {matchedKw.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {matchedKw.slice(0, 6).map((k: string, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300">✓ {k}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-amber-700 dark:text-amber-300 mb-1">What’s missing</p>
                          {reason.gap && <p className="text-surface-700 dark:text-surface-200">{reason.gap}</p>}
                          {missingKw.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {missingKw.slice(0, 4).map((k: string, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-amber-500/15 dark:bg-amber-500/25 text-amber-700 dark:text-amber-300">△ {k}</span>
                              ))}
                            </div>
                          )}
                          {!reason.gap && (!missingKw || missingKw.length === 0) && <p className="text-surface-500 dark:text-surface-400">No major gaps</p>}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-surface-200 dark:border-surface-600 flex justify-end">
                        <button onClick={() => { setBriefJobId(m.job_id); setBriefText(null); setBriefError(null); generateJobBrief(m.job_id); }} className="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10">
                          <Brain size={12} /> AI brief for this role
                        </button>
                      </div>
                    </div>
                  );
                })}
                {matches.filter(m => m.fit_score >= SCORE_APPLY_OK).length === 0 && (
                  <p className="text-sm text-surface-500 dark:text-surface-400">No strong matches (82+) yet. Focus on adding skills and resume content to improve scores.</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <AlertCircle size={12} className="text-amber-500" /> Why some roles score lower
              </h4>
              <div className="space-y-4">
                {matches.filter(m => m.fit_score < SCORE_APPLY_OK).slice(0, 5).map(m => {
                  const reason = parseMatchReason(m.match_reason);
                  const matchedKw = (m.matched_keywords || []) as string[];
                  const missingKw = (m.missing_keywords || []) as string[];
                  return (
                    <div key={m.id} className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-700/30 p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <p className="font-semibold text-surface-900 dark:text-surface-100">{m.job?.title} · {m.job?.company}</p>
                          <ATSScoreBadge score={m.fit_score} />
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="font-medium text-surface-600 dark:text-surface-300 mb-1">Gaps / risks</p>
                          {reason.gap && <p className="text-surface-700 dark:text-surface-200">{reason.gap}</p>}
                          {reason.risk && reason.risk !== 'None' && <p className="text-red-600 dark:text-red-400 mt-0.5">{reason.risk}</p>}
                          {missingKw.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {missingKw.slice(0, 5).map((k: string, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-red-500/15 dark:bg-red-500/25 text-red-700 dark:text-red-300">✗ {k}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-surface-600 dark:text-surface-300 mb-1">What matched</p>
                          {matchedKw.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {matchedKw.slice(0, 4).map((k: string, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300">✓ {k}</span>
                              ))}
                            </div>
                          ) : <p className="text-surface-500 dark:text-surface-400">Few keywords matched</p>}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-surface-200 dark:border-surface-600 flex justify-end">
                        <button onClick={() => { setBriefJobId(m.job_id); setBriefText(null); setBriefError(null); generateJobBrief(m.job_id); }} className="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10">
                          <Brain size={12} /> AI brief for this role
                        </button>
                      </div>
                    </div>
                  );
                })}
                {matches.filter(m => m.fit_score < SCORE_APPLY_OK).length === 0 && (
                  <p className="text-sm text-surface-500 dark:text-surface-400">All your matches are 75+. Great fit profile.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {briefJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl border border-surface-200 dark:border-surface-600 w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-700">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wide">AI brief</p>
                <p className="text-sm font-bold text-surface-900 dark:text-surface-100 truncate">
                  {matches.find((m: any) => m.job_id === briefJobId)?.job?.title} · {matches.find((m: any) => m.job_id === briefJobId)?.job?.company}
                </p>
              </div>
              <button onClick={() => { setBriefJobId(null); setBriefText(null); setBriefError(null); }} className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 dark:text-surface-400 shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {briefLoading && !briefText && <div className="flex items-center gap-2 text-surface-500 dark:text-surface-400"><Spinner size={18} /> Generating brief…</div>}
              {briefError && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{briefError}</p>}
              {briefText && <div className="text-sm text-surface-700 dark:text-surface-200 leading-relaxed whitespace-pre-wrap">{briefText}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
