'use client';
import { useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { Play, CheckCircle2, XCircle, AlertCircle, Zap } from 'lucide-react';
import { cn } from '@/utils/helpers';

type LogLine = { type: 'progress' | 'error' | 'system'; text: string };
type MatchSummary = {
  candidate: string;
  jobs_evaluated: number;
  matches: number;
  top_score: number | null;
  top_job: string | null;
};

export default function MatchingPanel() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [summary, setSummary] = useState<MatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const addLog = (type: LogLine['type'], text: string) => {
    setLog(prev => [...prev, { type, text }]);
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }), 50);
  };

  const runMatching = useCallback(async () => {
    setRunning(true);
    setLog([]);
    setSummary(null);
    setError(null);
    addLog('system', `Starting matching engine${candidateId ? ' for selected candidate' : ' for all candidates'}...`);

    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidateId ? { candidate_id: candidateId } : {}),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response body');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              addLog('progress', event.message);
            } else if (event.type === 'complete') {
              setSummary(event.result?.summary || []);
              addLog('system', `✅ Complete — ${event.result?.total_matches_upserted} matches saved`);
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr: any) {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
      addLog('error', err.message);
    } finally {
      setRunning(false);
    }
  }, [candidateId]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-900 font-display flex items-center gap-2">
            <Zap size={18} className="text-brand-600" /> Matching Engine
          </h2>
          <p className="text-xs text-surface-500 mt-0.5">
            AI-powered job matching using Claude — scores candidates against all active jobs
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="label">Candidate ID <span className="text-surface-400 font-normal">(leave blank to run all)</span></label>
          <input
            value={candidateId}
            onChange={e => setCandidateId(e.target.value)}
            placeholder="Paste a candidate UUID to run for one person only"
            className="input text-sm"
            disabled={running}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runMatching}
            disabled={running}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {running ? <><Spinner size={14} /> Running...</> : <><Play size={14} /> Run Matching</>}
          </button>
          {!running && log.length > 0 && (
            <button onClick={() => { setLog([]); setSummary(null); setError(null); }}
              className="btn-ghost text-xs text-surface-400">
              Clear
            </button>
          )}
        </div>

        <div className="text-xs text-surface-400 space-y-0.5">
          <p>⚡ Uses Claude Haiku for speed — ~3 parallel calls per candidate</p>
          <p>🔍 Title + keyword pre-filter keeps Claude calls minimal</p>
          <p>💾 Results saved to candidate_job_matches table in real-time</p>
        </div>
      </div>

      {/* Live log */}
      {log.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-surface-100 flex items-center gap-2">
            <span className="text-xs font-semibold text-surface-600 uppercase tracking-wide">Live Log</span>
            {running && <Spinner size={12} />}
          </div>
          <div ref={logRef} className="p-4 h-52 overflow-y-auto space-y-1 bg-surface-950 font-mono">
            {log.map((line, i) => (
              <p key={i} className={cn('text-xs leading-relaxed', {
                'text-surface-300': line.type === 'progress',
                'text-red-400': line.type === 'error',
                'text-brand-400 font-semibold': line.type === 'system',
              })}>
                {line.text}
              </p>
            ))}
            {running && <p className="text-xs text-surface-500 animate-pulse">▊</p>}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <XCircle size={14} /> {error}
        </div>
      )}

      {/* Summary table */}
      {summary && summary.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-200 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-500" />
            <span className="text-sm font-semibold text-surface-800">Results</span>
            <span className="text-xs text-surface-400">{summary.length} candidates processed</span>
          </div>
          <div className="divide-y divide-surface-50">
            {summary.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_60px_1fr] gap-3 items-center px-4 py-2.5 text-sm hover:bg-surface-50">
                <span className="font-medium text-surface-900 truncate">{s.candidate}</span>
                <span className="text-xs text-surface-500 text-right">{s.jobs_evaluated} evaluated</span>
                <span className={cn('text-xs font-semibold text-right', s.matches > 0 ? 'text-green-600' : 'text-surface-400')}>
                  {s.matches} matches
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  {s.top_score !== null ? (
                    <>
                      <span className={cn('shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold', scoreColor(s.top_score))}>
                        {s.top_score}
                      </span>
                      <span className="text-xs text-surface-500 truncate">{s.top_job}</span>
                    </>
                  ) : (
                    <span className="text-xs text-surface-400">No matches above threshold</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary && summary.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400 flex items-center gap-2">
          <AlertCircle size={14} /> No matches found — check that candidates have skills and active jobs exist.
        </div>
      )}
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 85) return 'bg-green-500/15 text-green-400';
  if (score >= 70) return 'bg-brand-600/15 text-brand-300';
  if (score >= 50) return 'bg-yellow-500/15 text-yellow-400';
  return 'bg-surface-700 text-surface-400';
}