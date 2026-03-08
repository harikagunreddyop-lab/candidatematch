'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { ChevronLeft, BarChart2, FileText, Loader2, History } from 'lucide-react';
import { AtsBreakdownPanel } from '@/components/ats/AtsBreakdownPanel';

type HistoryEntry = {
  id: string;
  jdPreview: string;
  ats_score: number;
  ats_reason?: string;
  ats_breakdown?: any;
  matched_keywords?: string[];
  missing_keywords?: string[];
  checked_at: string;
};

export default function CandidateAtsCheckerPage() {
  const supabase = createClient();
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [resumes, setResumes] = useState<{ id: string; label: string }[]>([]);
  const [jdText, setJdText] = useState('');
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    ats_score: number;
    ats_reason?: string;
    ats_breakdown?: any;
    matched_keywords?: string[];
    missing_keywords?: string[];
  } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('candidate_ats_check_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: candidate } = await supabase
        .from('candidates')
        .select('id')
        .eq('user_id', session.user.id)
        .single();
      if (candidate) {
        setCandidateId(candidate.id);
        const { data: res } = await supabase
          .from('candidate_resumes')
          .select('id, file_name')
          .eq('candidate_id', candidate.id)
          .order('uploaded_at', { ascending: false });
        setResumes((res || []).map((r: any) => ({ id: r.id, label: r.file_name || 'Resume' })));
        if (res?.length && !resumeId) setResumeId(res[0].id);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; resumeId set inside
  }, []);

  const runCheck = async () => {
    if (!candidateId || !jdText.trim()) {
      setError('Paste a job description to check your resume against.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/ats/check-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          jd_text: jdText.trim(),
          resume_id: resumeId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ATS check failed');
      setResult({
        ats_score: data.ats_score,
        ats_reason: data.ats_reason,
        ats_breakdown: data.ats_breakdown,
        matched_keywords: data.matched_keywords,
        missing_keywords: data.missing_keywords,
      });
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        jdPreview: jdText.trim().slice(0, 80) + (jdText.length > 80 ? '…' : ''),
        ats_score: data.ats_score,
        ats_reason: data.ats_reason,
        ats_breakdown: data.ats_breakdown,
        matched_keywords: data.matched_keywords,
        missing_keywords: data.missing_keywords,
        checked_at: new Date().toISOString(),
      };
      const newHistory = [entry, ...history].slice(0, 10);
      setHistory(newHistory);
      if (typeof window !== 'undefined') localStorage.setItem('candidate_ats_check_history', JSON.stringify(newHistory));
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/dashboard/candidate" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm mb-6">
        <ChevronLeft size={18} /> Dashboard
      </Link>
      <div className="flex items-center gap-3 mb-2">
        <BarChart2 className="w-8 h-8 text-brand-400" />
        <h1 className="text-2xl font-bold text-white">ATS Checker</h1>
      </div>
      <p className="text-surface-400 text-sm mb-8">
        Paste a job description to see how well your resume matches. You’ll get a score, a 9-dimension breakdown, and specific improvement suggestions.
      </p>

      <div className="space-y-6">
        <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-6">
          <label className="block text-sm font-medium text-white mb-2">Job description</label>
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the full job description here…"
            rows={8}
            className="w-full px-4 py-3 rounded-lg bg-surface-900 border border-surface-700 text-white placeholder-surface-500 focus:ring-2 focus:ring-brand-400 focus:border-transparent resize-y"
          />
          {resumes.length > 0 && (
            <div className="mt-3">
              <label className="block text-sm text-surface-400 mb-1">Resume to use</label>
              <select
                value={resumeId || ''}
                onChange={(e) => setResumeId(e.target.value || null)}
                className="px-3 py-2 rounded-lg bg-surface-900 border border-surface-700 text-white"
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
          )}
          {!candidateId && (
            <p className="text-amber-500 text-sm mt-2">Complete your profile and upload a resume to use the ATS checker.</p>
          )}
          <button
            onClick={runCheck}
            disabled={loading || !candidateId || !jdText.trim()}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-brand-400 hover:bg-brand-300 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {loading ? 'Checking…' : 'Run ATS check'}
          </button>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        {result && (
          <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Your result</h2>
            <AtsBreakdownPanel
              atsScore={result.ats_score}
              atsReason={result.ats_reason}
              atsBreakdown={result.ats_breakdown}
              matchedKeywords={result.matched_keywords}
              missingKeywords={result.missing_keywords}
              visible={true}
              compact={false}
            />
          </div>
        )}

        {history.length > 0 && (
          <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <History className="w-5 h-5 text-surface-400" />
              Recent checks
            </h2>
            <ul className="space-y-2">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between py-2 border-b border-surface-700/50 last:border-0">
                  <span className="text-surface-300 text-sm truncate max-w-[60%]" title={entry.jdPreview}>
                    {entry.jdPreview}
                  </span>
                  <span className="text-emerald-400 font-semibold shrink-0 ml-2">{entry.ats_score}%</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-surface-500 mt-2">Saved in this browser. Clear data to reset.</p>
          </div>
        )}
      </div>
    </div>
  );
}
