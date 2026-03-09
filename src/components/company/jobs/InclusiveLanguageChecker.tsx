'use client';

import { useState } from 'react';
import { ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface InclusiveLanguageResult {
  gender_bias: { male_coded: string[]; female_coded: string[] };
  age_bias: string[];
  ableist: string[];
  overall_score: number;
  suggestions: { term: string; suggestion: string; category: string }[];
}

interface InclusiveLanguageCheckerProps {
  jobId: string;
  onScore?: (score: number) => void;
  className?: string;
}

export function InclusiveLanguageChecker({ jobId, onScore, className }: InclusiveLanguageCheckerProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InclusiveLanguageResult | null>(null);
  const [error, setError] = useState('');

  const runCheck = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/company/jobs/${jobId}/check-inclusivity`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      setResult(data);
      onScore?.(data.overall_score);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check');
    } finally {
      setLoading(false);
    }
  };

  const hasIssues =
    result &&
    (result.gender_bias.male_coded.length > 0 ||
      result.gender_bias.female_coded.length > 0 ||
      result.age_bias.length > 0 ||
      result.ableist.length > 0);

  return (
    <div className={cn('rounded-2xl border border-surface-700 bg-surface-800/50 p-6', className)}>
      <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2">
        <ShieldCheck className="w-5 h-5 text-emerald-400" />
        Inclusive language check
      </h3>
      <p className="text-sm text-surface-400 mb-4">
        Detect gender-coded, age-biased, or ableist language to attract a diverse candidate pool.
      </p>

      <button
        type="button"
        onClick={runCheck}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600 disabled:opacity-50 text-white rounded-xl font-medium text-sm"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
        {loading ? 'Checking...' : 'Check description'}
      </button>

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

      {result && (
        <div className="mt-4 space-y-4 pt-4 border-t border-surface-700">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'text-2xl font-bold',
                result.overall_score >= 80 && 'text-emerald-400',
                result.overall_score >= 50 && result.overall_score < 80 && 'text-amber-400',
                result.overall_score < 50 && 'text-rose-400'
              )}
            >
              {result.overall_score}
            </span>
            <span className="text-surface-400 text-sm">/ 100 inclusivity score</span>
          </div>

          {hasIssues && (
            <div className="space-y-3 text-sm">
              {result.gender_bias.male_coded.length > 0 && (
                <div>
                  <p className="text-amber-400 font-medium">Male-coded terms:</p>
                  <p className="text-surface-400">{result.gender_bias.male_coded.join(', ')}</p>
                </div>
              )}
              {result.gender_bias.female_coded.length > 0 && (
                <div>
                  <p className="text-amber-400 font-medium">Female-coded terms:</p>
                  <p className="text-surface-400">{result.gender_bias.female_coded.join(', ')}</p>
                </div>
              )}
              {result.age_bias.length > 0 && (
                <div>
                  <p className="text-amber-400 font-medium">Age bias:</p>
                  <p className="text-surface-400">{result.age_bias.join(', ')}</p>
                </div>
              )}
              {result.ableist.length > 0 && (
                <div>
                  <p className="text-amber-400 font-medium">Ableist terms:</p>
                  <p className="text-surface-400">{result.ableist.join(', ')}</p>
                </div>
              )}
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div>
              <p className="text-surface-300 font-medium mb-1">Suggestions:</p>
              <ul className="list-disc list-inside text-surface-400 text-sm space-y-0.5">
                {result.suggestions.map((s, i) => (
                  <li key={i}>
                    &quot;{s.term}&quot; → {s.suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!hasIssues && result.suggestions.length === 0 && result.overall_score >= 80 && (
            <p className="text-emerald-400 text-sm">No issues detected. Description looks inclusive.</p>
          )}
        </div>
      )}
    </div>
  );
}
