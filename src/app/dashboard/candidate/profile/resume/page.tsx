'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ResumeUploadZone,
  ResumeList,
  ATSScoreCard,
  KeywordHeatmap,
  ResumeOptimizer,
} from '@/components/candidate/resume';
import type { ResumeRecord } from '@/components/candidate/resume';
import { Spinner, ToastContainer } from '@/components/ui';
import { useToast } from '@/hooks';
import { ChevronLeft, FileText } from 'lucide-react';

const MAX_RESUMES = 5;

export default function CandidateResumePage() {
  const { toasts, toast, dismiss } = useToast();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [atsResult, setAtsResult] = useState<{
    score: number;
    breakdown?: any;
    recommendations?: string[];
    matched_keywords?: string[];
    missing_keywords?: string[];
  } | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [notCandidate, setNotCandidate] = useState(false);

  const loadResumes = useCallback(async () => {
    const res = await fetch('/api/candidate/resume', { credentials: 'include' });
    if (res.status === 401 || res.status === 404) {
      setNotCandidate(true);
      setResumes([]);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setResumes(data.resumes ?? []);
    if (!selectedId && data.resumes?.length) {
      setSelectedId(data.resumes[0].id);
    }
  }, [selectedId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadResumes();
      setLoading(false);
    })();
  }, [loadResumes]);

  const selectedResume = selectedId ? resumes.find((r) => r.id === selectedId) : null;

  const handleUpload = useCallback(
    async (file: File, _versionName?: string, setDefault?: boolean) => {
      const form = new FormData();
      form.append('file', file);
      if (setDefault) form.append('set_default', 'true');
      const res = await fetch('/api/candidate/resume/upload', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast('Resume uploaded and analyzed', 'success');
      await loadResumes();
      setSelectedId(data.resume_id);
      setAtsResult({
        score: data.ats_score ?? 0,
        breakdown: data.breakdown,
        recommendations: data.issues ?? [],
        matched_keywords: data.breakdown?.keywords?.matched ?? [],
        missing_keywords: data.breakdown?.keywords?.missing ?? [],
      });
      await loadResumes();
      setSelectedId(data.resume_id);
    },
    [loadResumes, toast]
  );

  const handleSetDefault = useCallback(async (resumeId: string) => {
    const res = await fetch('/api/candidate/resume', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ resume_id: resumeId, is_default: true }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
    toast('Default resume updated', 'success');
    await loadResumes();
  }, [loadResumes, toast]);

  const handleDelete = useCallback(
    async (resumeId: string) => {
      const res = await fetch('/api/candidate/resume', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ resume_id: resumeId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
      toast('Resume deleted', 'success');
      if (selectedId === resumeId) {
        setSelectedId(null);
        setAtsResult(null);
      }
      await loadResumes();
    },
    [selectedId, loadResumes, toast]
  );

  const handleCheckAts = useCallback(
    async (resumeId: string) => {
      setAtsLoading(true);
      setAtsResult(null);
      try {
        const res = await fetch('/api/candidate/resume/check-ats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ resume_id: resumeId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'ATS check failed');
        setSelectedId(resumeId);
        setAtsResult({
          score: data.score ?? 0,
          breakdown: data.breakdown,
          recommendations: data.recommendations ?? [],
          matched_keywords: data.matched_keywords ?? [],
          missing_keywords: data.missing_keywords ?? [],
        });
      } catch (e: any) {
        toast(e?.message || 'ATS check failed', 'error');
      } finally {
        setAtsLoading(false);
      }
    },
    [toast]
  );

  const handleOptimize = useCallback((resumeId: string) => {
    setSelectedId(resumeId);
  }, []);

  const handleDownload = useCallback(async (resumeId: string) => {
    try {
      const res = await fetch(`/api/candidate-resumes?resume_id=${resumeId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const r = resumes.find((x) => x.id === resumeId);
      const name = r?.file_name || 'resume.pdf';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast('Download started', 'success');
    } catch (e: any) {
      toast(e?.message || 'Download failed', 'error');
    }
  }, [resumes, toast]);

  const runOptimize = useCallback(
    async (resumeId: string, focusArea?: string) => {
      const res = await fetch('/api/candidate/resume/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ resume_id: resumeId, focus_area: focusArea || 'all' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Optimization failed');
      return data;
    },
    []
  );

  if (notCandidate) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-surface-500 dark:text-surface-400">Your account is not linked to a candidate profile.</p>
        <Link href="/dashboard/candidate" className="text-brand-600 dark:text-brand-400 mt-2 inline-block">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href="/dashboard/candidate/profile"
        className="text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 flex items-center gap-1 text-sm mb-6"
      >
        <ChevronLeft size={18} /> Profile
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <FileText className="w-8 h-8 text-brand-500" />
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">
          Resume management
        </h1>
      </div>
      <p className="text-surface-500 dark:text-surface-400 text-sm mb-8">
        Upload up to {MAX_RESUMES} resumes. Get an instant ATS score, keyword highlights, and AI improvement suggestions.
      </p>

      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-3">Upload resume</h2>
          <ResumeUploadZone
            onUpload={handleUpload}
            currentCount={resumes.length}
            maxResumes={MAX_RESUMES}
            disabled={resumes.length >= MAX_RESUMES}
          />
        </section>

        {resumes.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-3">Your resumes</h2>
            <ResumeList
              resumes={resumes}
              onSetDefault={handleSetDefault}
              onDelete={handleDelete}
              onCheckAts={handleCheckAts}
              onOptimize={handleOptimize}
              onDownload={handleDownload}
              loading={loading}
            />
          </section>
        )}

        {selectedId && (
          <>
            <section>
              <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-3">ATS score</h2>
              {atsLoading ? (
                <div className="flex items-center gap-2 text-surface-500">
                  <Spinner size={20} /> Analyzing…
                </div>
              ) : selectedResume && atsResult ? (
                <ATSScoreCard
                  score={atsResult.score}
                  breakdown={atsResult.breakdown}
                  recommendations={atsResult.recommendations}
                />
              ) : selectedResume?.ats_score != null ? (
                <ATSScoreCard
                  score={selectedResume.ats_score}
                  breakdown={(selectedResume as any).ats_feedback?.breakdown}
                  recommendations={(selectedResume as any).ats_feedback?.recommendations}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => handleCheckAts(selectedId)}
                  className="btn-secondary text-sm py-2 px-4"
                >
                  Run ATS check
                </button>
              )}
            </section>

            {atsResult && (
              <section>
                <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-3">Keyword summary</h2>
                <KeywordHeatmap
                  text=""
                  matchedKeywords={atsResult.matched_keywords ?? []}
                  missingKeywords={atsResult.missing_keywords ?? []}
                />
              </section>
            )}

            <section>
              <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-3">AI optimizer</h2>
              <ResumeOptimizer resumeId={selectedId} onRun={runOptimize} />
            </section>

            <section className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 p-4">
              <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-2">Resume builder & export</h2>
              <p className="text-sm text-surface-600 dark:text-surface-300 mb-3">
                Use the download button on each resume to export as PDF. To build a new resume from your profile data, edit your profile and use the ATS checker with a job description.
              </p>
              <Link
                href="/dashboard/candidate/profile"
                className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
              >
                Edit profile
              </Link>
            </section>
          </>
        )}
      </div>

      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
