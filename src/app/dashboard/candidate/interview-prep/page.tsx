'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  FileText,
  Mic,
  Mail,
  Loader2,
  Plus,
  MessageSquare,
} from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import {
  CompanyResearchPanel,
  STARMethodBuilder,
  ThankYouNoteGenerator,
  MockInterviewSimulator,
} from '@/components/interviews';
import type { Interview, InterviewQuestionPrep, STARMethod } from '@/types/interviews';
import { cn } from '@/utils/helpers';

type TabId = 'research' | 'questions' | 'mock' | 'thankyou' | 'post';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'research', label: 'Company research', icon: <Building2 size={16} /> },
  { id: 'questions', label: 'Questions & STAR', icon: <FileText size={16} /> },
  { id: 'mock', label: 'Mock interview', icon: <Mic size={16} /> },
  { id: 'thankyou', label: 'Thank-you note', icon: <Mail size={16} /> },
  { id: 'post', label: 'Post-interview', icon: <MessageSquare size={16} /> },
];

function getJob(inv: Interview) {
  const j = inv.job;
  if (!j) return null;
  return Array.isArray(j) ? j[0] ?? null : j;
}

export default function InterviewPrepPage() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const interviewIdParam = searchParams.get('interviewId');
  const tabParam = searchParams.get('tab') as TabId | null;

  const [interview, setInterview] = useState<Interview | null>(null);
  const [interviewList, setInterviewList] = useState<Interview[]>([]);
  const [questions, setQuestions] = useState<InterviewQuestionPrep[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>(tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'research');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [notLinked, setNotLinked] = useState(false);
  const [addQuestionText, setAddQuestionText] = useState('');
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [postNotes, setPostNotes] = useState('');
  const [postScore, setPostScore] = useState<number | ''>('');
  const [postOutcome, setPostOutcome] = useState<string>('');
  const [savingPost, setSavingPost] = useState(false);

  const job = useMemo(() => (interview ? getJob(interview) : null), [interview]);

  const loadInterview = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/candidate/interviews/${id}`, { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return data as Interview;
    },
    []
  );

  const loadQuestions = useCallback(async (id: string) => {
    const res = await fetch(`/api/candidate/interviews/${id}/questions`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    return (data.questions ?? []) as InterviewQuestionPrep[];
  }, []);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    const { data: cand } = await supabase
      .from('candidates')
      .select('id')
      .eq('user_id', session.user.id)
      .single();
    if (!cand) {
      setNotLinked(true);
      setLoading(false);
      return;
    }

    const listRes = await fetch('/api/candidate/interviews', { credentials: 'include' });
    const listData = await listRes.json().catch(() => ({}));
    const list = (listData.interviews ?? []) as Interview[];
    setInterviewList(list);

    if (interviewIdParam) {
      const inv = await loadInterview(interviewIdParam);
      setInterview(inv ?? null);
      if (inv) {
        setPostNotes(inv.post_interview_notes ?? '');
        setPostScore(inv.self_assessment_score ?? '');
        setPostOutcome(inv.outcome ?? '');
        const qs = await loadQuestions(inv.id);
        setQuestions(qs);
      }
    } else if (list.length > 0) {
      const first = list.find((i) => new Date(i.scheduled_at) >= new Date()) ?? list[0];
      setInterview(first);
      setPostNotes(first.post_interview_notes ?? '');
      setPostScore(first.self_assessment_score ?? '');
      setPostOutcome(first.outcome ?? '');
      const qs = await loadQuestions(first.id);
      setQuestions(qs);
    }
    setLoading(false);
  }, [interviewIdParam, loadInterview, loadQuestions, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) setTab(tabParam);
  }, [tabParam]);

  const saveQuestion = async (questionId: string, star: STARMethod, answer?: string) => {
    try {
      await fetch(`/api/candidate/interviews/${interview!.id}/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          star_method: star,
          candidate_answer: answer ?? undefined,
        }),
      });
      const qs = await loadQuestions(interview!.id);
      setQuestions(qs);
    } catch {
      // ignore
    }
  };

  const getFeedbackForQuestion = async (): Promise<string> => {
    if (!selectedQuestionId) return '';
    const res = await fetch(
      `/api/candidate/interviews/${interview!.id}/questions/${selectedQuestionId}/feedback`,
      { method: 'POST', credentials: 'include' }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to get feedback');
    return data.feedback ?? '';
  };

  const addQuestion = async () => {
    if (!interview || !addQuestionText.trim()) return;
    setSavingQuestion(true);
    try {
      const res = await fetch(`/api/candidate/interviews/${interview.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question_text: addQuestionText.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setQuestions((prev) => [...prev, data]);
        setAddQuestionText('');
        setSelectedQuestionId(data.id);
      }
    } finally {
      setSavingQuestion(false);
    }
  };

  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (notLinked) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-surface-500 dark:text-surface-400">Your account isn&apos;t linked to a candidate profile.</p>
        <Link href="/dashboard/candidate" className="btn-primary mt-4 inline-block">
          Go to dashboard
        </Link>
      </div>
    );
  }

  if (!interview && interviewList.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">Interview prep</h1>
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-8 text-center">
          <p className="text-surface-500 dark:text-surface-400">
            You don&apos;t have any interviews yet. Add an interview from the Interviews page to prepare.
          </p>
          <Link href="/dashboard/candidate/interviews" className="btn-primary mt-4 inline-block">
            Go to Interviews
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">
            Interview preparation
          </h1>
          <p className="text-surface-500 dark:text-surface-400 mt-0.5">
            Research the company, practice questions with STAR, run a mock interview, and send a thank-you.
          </p>
        </div>
        {interviewList.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
              Prepare for
            </label>
            <select
              value={interview?.id ?? ''}
              onChange={async (e) => {
                const id = e.target.value;
                if (!id) return;
                const inv = await loadInterview(id);
                setInterview(inv ?? null);
              if (inv) {
                const qs = await loadQuestions(inv.id);
                setQuestions(qs);
                setSelectedQuestionId(null);
                setPostNotes(inv.post_interview_notes ?? '');
                setPostScore(inv.self_assessment_score ?? '');
                setPostOutcome(inv.outcome ?? '');
              }
              }}
              className="input dark:bg-surface-700 dark:border-surface-600"
            >
              {interviewList.map((inv) => {
                const j = getJob(inv);
                return (
                  <option key={inv.id} value={inv.id}>
                    {j?.title ?? 'Interview'} at {j?.company}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              tab === t.id
                ? 'bg-surface-200 dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'research' && job && interview && (
        <CompanyResearchPanel
          companyName={job.company ?? ''}
          jobTitle={job.title ?? ''}
          interviewId={interview.id}
        />
      )}

      {tab === 'questions' && interview && (
        <div className="space-y-6">
          <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 p-4">
            <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-3">Question bank</h3>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={addQuestionText}
                onChange={(e) => setAddQuestionText(e.target.value)}
                placeholder="Add a question to practice…"
                className="input flex-1 text-sm dark:bg-surface-700 dark:border-surface-600"
                onKeyDown={(e) => e.key === 'Enter' && addQuestion()}
              />
              <button
                type="button"
                onClick={addQuestion}
                disabled={savingQuestion || !addQuestionText.trim()}
                className="btn-primary text-sm py-2 px-4 flex items-center gap-1"
              >
                {savingQuestion ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add
              </button>
            </div>
            {questions.length === 0 ? (
              <p className="text-sm text-surface-500 dark:text-surface-400">
                Add questions you want to practice, or generate some via Mock interview and save them here.
              </p>
            ) : (
              <ul className="space-y-1">
                {questions.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedQuestionId(q.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                        selectedQuestionId === q.id
                          ? 'bg-brand-500/20 dark:bg-brand-500/30 text-brand-700 dark:text-brand-300'
                          : 'hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-200'
                      )}
                    >
                      {q.question_text.slice(0, 80)}
                      {q.question_text.length > 80 ? '…' : ''}
                      {q.ai_feedback && (
                        <span className="ml-2 text-xs text-green-600 dark:text-green-400">✓ feedback</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selectedQuestion && (
            <STARMethodBuilder
              questionText={selectedQuestion.question_text}
              questionId={selectedQuestion.id}
              initialStar={selectedQuestion.star_method}
              initialAnswer={selectedQuestion.candidate_answer}
              onSave={(star, answer) => saveQuestion(selectedQuestion.id, star, answer)}
              getFeedback={getFeedbackForQuestion}
            />
          )}
          {questions.length > 0 && !selectedQuestion && (
            <p className="text-sm text-surface-500 dark:text-surface-400">
              Select a question above to build your STAR response and get AI feedback.
            </p>
          )}
        </div>
      )}

      {tab === 'mock' && interview && (
        <MockInterviewSimulator
          interviewId={interview.id}
          sessionType="behavioral"
        />
      )}

      {tab === 'thankyou' && interview && (
        <ThankYouNoteGenerator
          interviewId={interview.id}
          interviewerName={interview.interviewer_name}
        />
      )}

      {tab === 'post' && interview && (
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 p-5 space-y-4">
          <h3 className="font-semibold text-surface-900 dark:text-surface-100">Post-interview notes & outcome</h3>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            Record your reflection, self-assessment, and outcome after the interview.
          </p>
          <div>
            <label className="label text-surface-700 dark:text-surface-200">Notes / reflection</label>
            <textarea
              value={postNotes}
              onChange={(e) => setPostNotes(e.target.value)}
              className="input w-full min-h-[120px] dark:bg-surface-700 dark:border-surface-600"
              placeholder="What went well? What would you do differently? Key takeaways…"
              rows={4}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-surface-700 dark:text-surface-200">Self-assessment (1–10)</label>
              <select
                value={postScore === '' ? '' : String(postScore)}
                onChange={(e) => setPostScore(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                className="input w-full dark:bg-surface-700 dark:border-surface-600"
              >
                <option value="">Select</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-surface-700 dark:text-surface-200">Outcome</label>
              <select
                value={postOutcome}
                onChange={(e) => setPostOutcome(e.target.value)}
                className="input w-full dark:bg-surface-700 dark:border-surface-600"
              >
                <option value="">Select</option>
                <option value="pending">Pending</option>
                <option value="passed">Passed / Next round</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            disabled={savingPost}
            onClick={async () => {
              if (!interview) return;
              setSavingPost(true);
              try {
                const res = await fetch(`/api/candidate/interviews/${interview.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    post_interview_notes: postNotes || null,
                    self_assessment_score: postScore === '' ? null : postScore,
                    outcome: postOutcome || null,
                  }),
                });
                if (res.ok) {
                  const inv = await loadInterview(interview.id);
                  if (inv) setInterview(inv);
                }
              } finally {
                setSavingPost(false);
              }
            }}
            className="btn-primary"
          >
            {savingPost ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
