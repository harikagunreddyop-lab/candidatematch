'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Mic, Square } from 'lucide-react';
import { cn } from '@/utils/helpers';

type Question = { question: string; context: string; difficulty: string; sampleAnswer: string };

export default function InterviewPrepPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<Array<{ id: string; title: string; company: string }>>([]);
  const [job, setJob] = useState<{ id: string; title: string; company: string } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [recording, setRecording] = useState(false);
  const [answers, setAnswers] = useState<Record<number, { feedback: string }>>({});
  const [genLoading, setGenLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: c } = await supabase.from('candidates').select('id').eq('user_id', session.user.id).single();
      if (!c) return;
      const { data: matches } = await supabase
        .from('candidate_job_matches')
        .select('job_id, job:jobs(id, title, company)')
        .eq('candidate_id', c.id)
        .gte('fit_score', 60)
        .limit(20);
      const list = (matches || [])
        .map((m: any) => m.job)
        .filter(Boolean)
        .map((j: any) => ({ id: j.id, title: j.title, company: j.company }));
      setJobs(list);
      if (list.length) setJob(list[0]);
    })();
  }, [supabase]);

  async function generateQuestions() {
    if (!job) return;
    setGenLoading(true);
    try {
      const res = await fetch('/api/interview/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json();
      if (res.ok && data.questions?.length) {
        setQuestions(data.questions);
        setCurrentQ(0);
        setAnswers({});
      }
    } finally {
      setGenLoading(false);
    }
  }

  const q = questions[currentQ];
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Interview Preparation</h1>

      {!job && jobs.length === 0 && (
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-8 text-center">
          <p className="text-surface-500 dark:text-surface-400">No matched jobs yet. Get matches first to prep.</p>
          <Link href="/dashboard/candidate" className="btn-primary mt-4 inline-block">Go to dashboard</Link>
        </div>
      )}

      {job && questions.length === 0 && (
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6">
          <label className="label text-surface-700 dark:text-surface-200">Select job</label>
          <select
            value={job.id}
            onChange={(e) => {
              const j = jobs.find(x => x.id === e.target.value);
              if (j) setJob(j);
            }}
            className="input w-full max-w-md"
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title} — {j.company}</option>
            ))}
          </select>
          <button
            onClick={generateQuestions}
            disabled={genLoading}
            className="btn-primary mt-4"
          >
            {genLoading ? 'Generating…' : 'Generate practice questions'}
          </button>
        </div>
      )}

      {q && (
        <>
          <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm text-surface-500 dark:text-surface-400">
                Question {currentQ + 1} of {questions.length}
              </span>
              <span
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-semibold',
                  q.difficulty === 'hard' ? 'bg-red-500/10 text-red-500 dark:text-red-400' : 'bg-blue-500/10 text-blue-500 dark:text-blue-400'
                )}
              >
                {q.difficulty}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-surface-900 dark:text-white mb-4">{q.question}</h2>
            <p className="text-surface-500 dark:text-surface-400 mb-6">{q.context}</p>
            <div className="bg-surface-100 dark:bg-surface-900 rounded-lg p-6">
              <button
                type="button"
                onClick={() => setRecording(!recording)}
                className={cn(
                  'w-full py-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2',
                  recording ? 'bg-red-500/20 text-red-600 dark:text-red-400' : 'bg-brand-400 hover:bg-brand-300 text-[#0a0f00]'
                )}
              >
                {recording ? <><Square size={18} /> Stop recording</> : <><Mic size={18} /> Start answer</>}
              </button>
            </div>
            {answers[currentQ] && (
              <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <h4 className="font-semibold text-emerald-600 dark:text-emerald-400 mb-2">AI feedback</h4>
                <p className="text-sm text-surface-700 dark:text-surface-200">{answers[currentQ].feedback}</p>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6">
            <h3 className="text-lg font-semibold text-surface-900 dark:text-white mb-4">Sample answer</h3>
            <p className="text-surface-600 dark:text-surface-300">{q.sampleAnswer}</p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <button type="button" onClick={() => setCurrentQ((i) => Math.max(0, i - 1))} disabled={currentQ === 0} className="btn-secondary flex items-center gap-1">
              <ChevronLeft size={18} /> Previous
            </button>
            <button type="button" onClick={() => setCurrentQ((i) => Math.min(questions.length - 1, i + 1))} disabled={currentQ === questions.length - 1} className="btn-primary flex items-center gap-1">
              Next <ChevronRight size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
