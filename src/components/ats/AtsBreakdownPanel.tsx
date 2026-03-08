'use client';

/**
 * ATS Score Breakdown Panel — Clear explanation of score, what's missing, and why.
 * Access-controlled by parent: candidate_see_ats_fix_report for candidates; recruiters/admins always see.
 */

import { ChevronDown, ChevronUp, BarChart2, Sparkles, MessageSquare, Shield } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/utils/helpers';

const DIMENSION_LABELS: Record<string, string> = {
  parse: 'Resume parseability',
  must: 'Must-have skills',
  nice: 'Nice-to-have skills',
  resp: 'Responsibility alignment',
  impact: 'Impact & metrics',
  scope: 'Years + leadership + scale',
  recent: 'Skill recency',
  domain: 'Role / domain',
  risk: 'Risk factors',
  // Legacy (backward compat)
  keyword: 'Skills & keywords',
  experience: 'Years of experience',
  title: 'Role / title alignment',
  education: 'Education',
  location: 'Location & visa',
  formatting: 'Resume formatting',
  behavioral: 'Behavioral signals',
  soft: 'Nuanced fit',
};

type DimensionScore = {
  score: number;
  details: string;
  matched?: string[];
  missing?: string[];
  impact_examples?: Array<{ snippet: string; type: string }>;
  evidence_spans?: Array<{ skill: string; resume_snippet: string; requirement_source?: string }>;
};

type FixRecommendation = {
  priority: 'high' | 'medium' | 'low';
  dimension: string;
  title: string;
  action: string;
  placeholders?: string[];
};

type FixReport = {
  score: number;
  band: string;
  summary: string;
  recommendations: FixRecommendation[];
  add_to_bullets?: string[];
  skills_needing_evidence?: string[];
};

type PerResumeScore = {
  label: string;
  ats_score: number;
  is_best?: boolean;
};

type AtsBreakdown = {
  dimensions?: Record<string, DimensionScore>;
  fix_report?: FixReport;
  matched_keywords?: string[];
  missing_keywords?: string[];
  p_interview?: number | null;
  calibration_reliable?: boolean;
  job_family?: string;
  per_resume_scores?: PerResumeScore[];
};

type Props = {
  atsScore: number;
  atsReason?: string | null;
  atsBreakdown?: AtsBreakdown | null;
  matchedKeywords?: string[];
  missingKeywords?: string[];
  visible?: boolean;
  className?: string;
  compact?: boolean;
  /** For bullet rewrite and AI: candidate + job context */
  candidateId?: string | null;
  jobId?: string | null;
  jobTitle?: string | null;
  candidateTitle?: string | null;
};

export function AtsBreakdownPanel({
  atsScore,
  atsReason,
  atsBreakdown,
  matchedKeywords = [],
  missingKeywords = [],
  visible = true,
  className,
  compact = false,
  candidateId,
  jobId,
  jobTitle: jobTitleProp,
  candidateTitle: candidateTitleProp,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [bulletRewriteLoading, setBulletRewriteLoading] = useState(false);
  const [bulletRewrites, setBulletRewrites] = useState<string[] | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainResult, setExplainResult] = useState<{ narrative: string; risk_summary: string; audit_summary: string } | null>(null);
  const [objectionLoading, setObjectionLoading] = useState(false);
  const [objectionResult, setObjectionResult] = useState<{
    rejection_reasons: Array<{ reason: string; likelihood: string; detail: string }>;
    defense_talking_points: Array<{ objection: string; response: string }>;
  } | null>(null);

  if (!visible) return null;
  if (typeof atsScore !== 'number') return null;

  const dims = atsBreakdown?.dimensions || {};
  // matched/missing: from props or must dimension (v4) or keyword (legacy)
  const mustDim = dims.must as DimensionScore | undefined;
  const kwDim = dims.keyword as DimensionScore | undefined;
  const missingKw = (missingKeywords.length > 0 ? missingKeywords : (mustDim?.missing ?? kwDim?.missing ?? [])) as string[];
  const matchedKw = (matchedKeywords.length > 0 ? matchedKeywords : (mustDim?.matched ?? kwDim?.matched ?? [])) as string[];

  const dimEntries = Object.entries(dims).filter(
    ([, v]) => v && typeof (v as DimensionScore).score === 'number'
  ) as [string, DimensionScore][];

  const weakest = dimEntries
    .sort(([, a], [, b]) => (a as DimensionScore).score - (b as DimensionScore).score)
    .slice(0, 3);
  const isLowScore = atsScore < 80;

  return (
    <div
      className={cn(
        'rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50/50 dark:bg-surface-800/50 overflow-hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-100/50 dark:hover:bg-surface-700/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <BarChart2 size={16} className="shrink-0 text-surface-500 dark:text-surface-400" />
          <span className="text-sm font-medium text-surface-700 dark:text-surface-200">
            ATS score breakdown
          </span>
          {!expanded && atsBreakdown?.p_interview != null && atsBreakdown.p_interview >= 0 && (
            <span className="text-xs text-surface-500 dark:text-surface-400" title={atsBreakdown.calibration_reliable ? 'Based on historical outcomes' : 'Limited data'}>
              ~{Math.round(atsBreakdown.p_interview * 100)}% interview chance
            </span>
          )}
          <span
            title={atsScore >= 80 ? '80+ = apply ready' : atsScore >= 61 ? '61–79 = tailor resume first' : '≤60 = improve resume, then run ATS again'}
            className={cn(
              'text-sm font-semibold px-1.5 py-0.5 rounded cursor-help',
              atsScore >= 80
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : atsScore >= 61
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'bg-red-500/15 text-red-600 dark:text-red-400'
            )}
          >
            {atsScore}
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="shrink-0 text-surface-400" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-surface-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-surface-100 dark:border-surface-700">
          {atsReason && (
            <p className="text-sm text-surface-600 dark:text-surface-300">{atsReason}</p>
          )}

          {/* Elite AI: Plain-English explanation */}
          <div className="rounded-lg bg-surface-100 dark:bg-surface-700/50 border border-surface-200 dark:border-surface-600 px-3 py-2.5">
            {!explainResult ? (
              <button
                type="button"
                onClick={async () => {
                  setExplainLoading(true);
                  setExplainResult(null);
                  try {
                    const res = await fetch('/api/ats/explain', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ats_breakdown: atsBreakdown,
                        ats_score: atsScore,
                        job_title: jobTitleProp || 'this role',
                        candidate_title: candidateTitleProp,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok && data.narrative) setExplainResult({ narrative: data.narrative, risk_summary: data.risk_summary || '', audit_summary: data.audit_summary || '' });
                  } finally {
                    setExplainLoading(false);
                  }
                }}
                disabled={explainLoading}
                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1.5"
              >
                {explainLoading ? 'Generating…' : <><MessageSquare size={12} /> AI explanation</>}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-surface-700 dark:text-surface-200">AI explanation</p>
                <p className="text-xs text-surface-600 dark:text-surface-300">{explainResult.narrative}</p>
                {explainResult.risk_summary && <p className="text-xs text-amber-700 dark:text-amber-300"><strong>Risks:</strong> {explainResult.risk_summary}</p>}
              </div>
            )}
          </div>

          {/* Elite AI: Objection predictor (when candidate + job context) */}
          {candidateId && jobId && (
            <div className="rounded-lg bg-brand-400/10 dark:bg-brand-400/10 border border-brand-400/20 dark:border-brand-400/20 px-3 py-2.5">
              {!objectionResult ? (
                <button
                  type="button"
                  onClick={async () => {
                    setObjectionLoading(true);
                    setObjectionResult(null);
                    try {
                      const res = await fetch('/api/ats/objection-predictor', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ candidate_id: candidateId, job_id: jobId }),
                      });
                      const data = await res.json();
                      if (res.ok && data.rejection_reasons) setObjectionResult(data);
                    } finally {
                      setObjectionLoading(false);
                    }
                  }}
                  disabled={objectionLoading}
                  className="text-xs font-medium text-brand-400 hover:underline flex items-center gap-1.5"
                >
                  {objectionLoading ? 'Analyzing…' : <><Shield size={12} /> Predict interview objections</>}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-brand-400">Interview objections & defense</p>
                  {objectionResult.rejection_reasons?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Possible concerns:</p>
                      <ul className="text-xs text-surface-600 dark:text-surface-300 space-y-0.5">
                        {objectionResult.rejection_reasons.slice(0, 3).map((r: any, i: number) => (
                          <li key={i}>• {r.reason}{r.likelihood === 'high' ? ' (high)' : ''}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {objectionResult.defense_talking_points?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Talking points:</p>
                      <ul className="text-xs text-surface-600 dark:text-surface-300 space-y-1">
                        {objectionResult.defense_talking_points.slice(0, 3).map((d: any, i: number) => (
                          <li key={i}><span className="text-brand-400">{d.objection}</span> → {d.response}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Per-resume scores when available */}
          {Array.isArray(atsBreakdown?.per_resume_scores) && atsBreakdown!.per_resume_scores.length > 0 && (
            <div className="rounded-lg bg-surface-100 dark:bg-surface-700/50 border border-surface-200 dark:border-surface-600 px-3 py-2.5">
              <p className="text-xs font-semibold text-surface-700 dark:text-surface-200 mb-2">Scores by resume</p>
              <ul className="space-y-1.5">
                {atsBreakdown.per_resume_scores.map((pr, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-surface-600 dark:text-surface-400 truncate">{pr.label}</span>
                    <span className={cn(
                      'shrink-0 font-semibold tabular-nums',
                      pr.is_best ? 'text-emerald-600 dark:text-emerald-400' : 'text-surface-600 dark:text-surface-400'
                    )}>
                      {pr.ats_score}{pr.is_best ? ' ✓' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Calibrated P(interview) when available */}
          {atsBreakdown?.p_interview != null && atsBreakdown.p_interview >= 0 && (
            <p className="text-xs text-surface-500 dark:text-surface-400">
              Estimated interview probability: <span className="font-medium text-surface-700 dark:text-surface-300">{Math.round(atsBreakdown.p_interview * 100)}%</span>
              {atsBreakdown.calibration_reliable ? '' : ' (limited data)'}
            </p>
          )}

          {/* Fix report — actionable recommendations */}
          {atsBreakdown?.fix_report?.recommendations && atsBreakdown.fix_report.recommendations.length > 0 && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 px-3 py-2.5">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-1">
                How to improve
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                {atsBreakdown.fix_report.summary}
              </p>
              <ul className="space-y-2">
                {atsBreakdown.fix_report.recommendations.map((r, i) => (
                  <li key={i} className="text-xs">
                    <span className={cn(
                      'font-medium',
                      r.priority === 'high' ? 'text-red-700 dark:text-red-300' :
                      r.priority === 'medium' ? 'text-amber-700 dark:text-amber-300' :
                      'text-surface-600 dark:text-surface-400'
                    )}>
                      {r.title}
                    </span>
                    <p className="text-surface-600 dark:text-surface-400 mt-0.5">{r.action}</p>
                  </li>
                ))}
              </ul>
              {candidateId && jobId && ((atsBreakdown?.fix_report?.add_to_bullets?.length ?? 0) + (atsBreakdown?.fix_report?.skills_needing_evidence?.length ?? 0) + missingKw.length) > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!candidateId || !jobId) return;
                    setBulletRewriteLoading(true);
                    setBulletRewrites(null);
                    try {
                      const skills = [
                        ...(atsBreakdown?.fix_report?.add_to_bullets ?? []),
                        ...(atsBreakdown?.fix_report?.skills_needing_evidence ?? []),
                        ...missingKw,
                      ].slice(0, 5);
                      const bullets = skills.map(s => `Add experience demonstrating ${s}`);
                      const res = await fetch('/api/ats/bullet-rewrite', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ candidate_id: candidateId, job_id: jobId, bullets, missing_skills: missingKw }),
                      });
                      const data = await res.json();
                      if (res.ok && data.rewritten) setBulletRewrites(data.rewritten);
                    } finally {
                      setBulletRewriteLoading(false);
                    }
                  }}
                  disabled={bulletRewriteLoading}
                  className="mt-2 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline flex items-center gap-1"
                >
                  {bulletRewriteLoading ? 'Generating…' : <><Sparkles size={12} /> Improve bullets with AI</>}
                </button>
              )}
              {bulletRewrites && bulletRewrites.length > 0 && (
                <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                  <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">Suggested bullets:</p>
                  <ul className="text-xs text-surface-700 dark:text-surface-300 space-y-1">
                    {bulletRewrites.map((b, i) => (
                      <li key={i} className="italic">&ldquo;{b}&rdquo;</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* What's missing — clear callout */}
          {isLowScore && missingKw.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 px-3 py-2.5">
              <p className="text-xs font-semibold text-red-800 dark:text-red-200 mb-1.5">
                What&apos;s missing
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mb-1.5">
                Add these required skills or keywords to your resume to improve your score:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingKw.map((k: string, i: number) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Why your score is lower */}
          {isLowScore && weakest.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1.5">
                Why your score is lower
              </p>
              <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                {weakest.map(([key, d]) => (
                  <li key={key}>
                    <span className="font-medium">{DIMENSION_LABELS[key] || key}:</span>{' '}
                    {d.details} (score: {d.score})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Impact examples — quantified achievements */}
          {(() => {
            const behDim = (dims.behavioral ?? dims.impact) as DimensionScore | undefined;
            const examples = behDim?.impact_examples;
            if (!examples?.length) return null;
            return (
              <div>
                <p className="text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">
                  Quantified impact
                </p>
                <ul className="text-xs text-surface-600 dark:text-surface-300 space-y-1">
                  {examples.slice(0, 3).map((e, i) => (
                    <li key={i} className="italic">
                      &ldquo;{e.snippet}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {/* Matched keywords — positive reinforcement */}
          {matchedKw.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">
                Matched keywords
              </p>
              <div className="flex flex-wrap gap-1">
                {matchedKw.slice(0, 10).map((k: string, i: number) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 rounded text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                  >
                    ✓ {k}
                  </span>
                ))}
                {matchedKw.length > 10 && (
                  <span className="text-xs text-surface-500">+{matchedKw.length - 10} more</span>
                )}
              </div>
              {/* Evidence spans: where skills were found in resume */}
              {(() => {
                const evDim = (dims.must ?? dims.keyword) as DimensionScore | undefined;
                const spans = evDim?.evidence_spans;
                if (!spans?.length) return null;
                return (
                  <ul className="mt-2 space-y-1.5 text-xs text-surface-600 dark:text-surface-300">
                    {spans.slice(0, 4).map((s, i) => (
                      <li key={i}>
                        <span className="font-medium text-surface-700 dark:text-surface-200">{s.skill}</span>
                        {s.requirement_source && (
                          <span className="text-surface-500 ml-1">({s.requirement_source.replace('_', '-')})</span>
                        )}
                        : <span className="italic">&ldquo;{s.resume_snippet}&rdquo;</span>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          )}

          {/* Full dimension breakdown */}
          {!compact && dimEntries.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-surface-600 dark:text-surface-400 mb-2">
                Score by category
              </p>
              <div className="space-y-2">
                {dimEntries.map(([key, d]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-surface-600 dark:text-surface-400 w-[140px] shrink-0">
                      {DIMENSION_LABELS[key] || key}
                    </span>
                    <div className="flex-1 h-1.5 bg-surface-200 dark:bg-surface-600 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          d.score >= 80
                            ? 'bg-emerald-500'
                            : d.score >= 61
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        )}
                        style={{ width: `${d.score}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-surface-700 dark:text-surface-300 w-8 shrink-0">
                      {d.score}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-2">
                Each category contributes to your overall ATS score. Improve weaker areas to raise your total.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
