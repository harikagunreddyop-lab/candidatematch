'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Send, Mic, Square } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface QuestionItem {
  question: string;
  context?: string;
  difficulty?: string;
  sampleAnswer?: string;
}

interface MockInterviewSimulatorProps {
  interviewId?: string;
  jobId?: string;
  sessionType?: 'behavioral' | 'technical' | 'case_study' | 'mixed';
  onComplete?: (result: { session_id: string; overall_score: number; ai_feedback: unknown }) => void;
  className?: string;
}

export function MockInterviewSimulator({
  interviewId,
  jobId,
  sessionType = 'behavioral',
  onComplete,
  className,
}: MockInterviewSimulatorProps) {
  const [step, setStep] = useState<'config' | 'questions' | 'result'>('config');
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [responses, setResponses] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    session_id: string;
    overall_score: number;
    confidence_score: number;
    ai_feedback: Record<string, unknown>;
  } | null>(null);
  const [perQuestionFeedback, setPerQuestionFeedback] = useState<Record<number, string>>({});
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const generateQuestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/candidate/mock-interview/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          interviewId ? { interview_id: interviewId, session_type: sessionType } : { job_id: jobId, session_type: sessionType }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate questions');
      setQuestions(data.questions ?? []);
      setResponses([]);
      setCurrentIndex(0);
      setStep('questions');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const getFeedbackForCurrent = async () => {
    const q = questions[currentIndex];
    const answer = responses[currentIndex] ?? '';
    if (!q || !answer.trim()) return;
    setFeedbackLoading(true);
    try {
      const res = await fetch('/api/candidate/mock-interview/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.question, answer }),
      });
      const data = await res.json();
      if (res.ok && data.feedback) {
        setPerQuestionFeedback((prev) => ({ ...prev, [currentIndex]: data.feedback }));
      }
    } finally {
      setFeedbackLoading(false);
    }
  };

  const submitSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const questionsAsked = questions.map((q) => q.question);
      const responsesPayload = questions.map((_, i) => ({ answer: responses[i] ?? '' }));
      const res = await fetch('/api/candidate/mock-interview/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: interviewId || undefined,
          job_id: jobId || undefined,
          session_type: sessionType,
          questions_asked: questionsAsked,
          responses: responsesPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save session');
      setResult({
        session_id: data.session_id,
        overall_score: data.overall_score ?? 0,
        confidence_score: data.confidence_score ?? 0,
        ai_feedback: data.ai_feedback ?? {},
      });
      setStep('result');
      onComplete?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const currentQ = questions[currentIndex];
  const currentResponse = responses[currentIndex] ?? '';

  if (step === 'config') {
    return (
      <div className={cn('rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 p-5', className)}>
        <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-2">Mock interview</h3>
        <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">
          Practice with AI-generated questions and get feedback. Choose behavioral, technical, or case study.
        </p>
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 text-red-700 dark:text-red-400 text-sm mb-4">{error}</div>
        )}
        <button
          type="button"
          onClick={generateQuestions}
          disabled={loading || (!interviewId && !jobId)}
          className="btn-primary inline-flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
          {loading ? 'Generating questions…' : 'Start mock interview'}
        </button>
        {!interviewId && !jobId && (
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-2">Select an interview or job first.</p>
        )}
      </div>
    );
  }

  if (step === 'questions' && currentQ) {
    return (
      <div className={cn('rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 p-5 space-y-4', className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-surface-500 dark:text-surface-400">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-200 dark:bg-surface-600 text-surface-600 dark:text-surface-300">
            {currentQ.difficulty ?? 'medium'}
          </span>
        </div>
        <h4 className="text-lg font-medium text-surface-900 dark:text-surface-100">{currentQ.question}</h4>
        {currentQ.context && (
          <p className="text-sm text-surface-500 dark:text-surface-400">{currentQ.context}</p>
        )}
        <div>
          <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Your answer</label>
          <textarea
            value={currentResponse}
            onChange={(e) => {
              const next = [...responses];
              next[currentIndex] = e.target.value;
              setResponses(next);
            }}
            className="input w-full min-h-[120px] text-sm dark:bg-surface-700 dark:border-surface-600"
            placeholder="Type your answer…"
            rows={4}
          />
        </div>
        {perQuestionFeedback[currentIndex] && (
          <div className="p-3 rounded-lg bg-brand-500/10 dark:bg-brand-500/20 border border-brand-500/20 text-sm text-surface-700 dark:text-surface-200">
            {perQuestionFeedback[currentIndex]}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={getFeedbackForCurrent}
            disabled={feedbackLoading || !currentResponse.trim()}
            className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            {feedbackLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Get feedback on this answer
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="btn-ghost text-sm py-2 px-4 inline-flex items-center gap-1"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          {currentIndex < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => i + 1)}
              className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-1"
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submitSession}
              disabled={loading}
              className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
              Finish & get report
            </button>
          )}
        </div>
        {currentQ.sampleAnswer && (
          <details className="pt-2 border-t border-surface-200 dark:border-surface-700">
            <summary className="text-sm font-medium text-surface-600 dark:text-surface-300 cursor-pointer">
              Sample answer
            </summary>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-2 whitespace-pre-wrap">
              {currentQ.sampleAnswer}
            </p>
          </details>
        )}
      </div>
    );
  }

  if (step === 'result' && result) {
    const feedback = result.ai_feedback as { summary?: string; strengths?: string[]; improvement_areas?: string[]; tip?: string };
    return (
      <div className={cn('rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 p-5 space-y-4', className)}>
        <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100">Mock interview complete</h3>
        <div className="flex gap-4">
          <div className="rounded-xl bg-brand-500/20 dark:bg-brand-500/30 px-4 py-2 text-center">
            <p className="text-2xl font-bold text-brand-700 dark:text-brand-300">{result.overall_score}</p>
            <p className="text-xs text-surface-600 dark:text-surface-400">Overall score</p>
          </div>
          <div className="rounded-xl bg-surface-200 dark:bg-surface-700 px-4 py-2 text-center">
            <p className="text-2xl font-bold text-surface-800 dark:text-surface-200">{result.confidence_score}</p>
            <p className="text-xs text-surface-600 dark:text-surface-400">Confidence</p>
          </div>
        </div>
        {feedback.summary && (
          <p className="text-sm text-surface-700 dark:text-surface-200">{feedback.summary}</p>
        )}
        {feedback.strengths && feedback.strengths.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold text-surface-600 dark:text-surface-300 mb-1">Strengths</h5>
            <ul className="list-disc list-inside text-sm text-surface-600 dark:text-surface-400">
              {feedback.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {feedback.improvement_areas && feedback.improvement_areas.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold text-surface-600 dark:text-surface-300 mb-1">Areas to improve</h5>
            <ul className="list-disc list-inside text-sm text-surface-600 dark:text-surface-400">
              {feedback.improvement_areas.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {feedback.tip && (
          <p className="text-sm text-brand-600 dark:text-brand-400 font-medium">Tip: {feedback.tip}</p>
        )}
        <button
          type="button"
          onClick={() => { setStep('config'); setResult(null); setQuestions([]); setResponses([]); }}
          className="btn-secondary text-sm py-2 px-4"
        >
          Practice again
        </button>
      </div>
    );
  }

  return null;
}
