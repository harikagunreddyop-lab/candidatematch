'use client';

import { useState } from 'react';
import { Building2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { CompanyResearch } from '@/types/interviews';
import { cn } from '@/utils/helpers';

interface CompanyResearchPanelProps {
  companyName: string;
  jobTitle: string;
  interviewId: string;
  onGenerated?: (research: CompanyResearch) => void;
  className?: string;
}

export function CompanyResearchPanel({
  companyName,
  jobTitle,
  interviewId,
  onGenerated,
  className,
}: CompanyResearchPanelProps) {
  const [research, setResearch] = useState<CompanyResearch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidate/interviews/${interviewId}/research`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate research');
      setResearch(data);
      onGenerated?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 overflow-hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-surface-50 dark:hover:bg-surface-800/80 transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 font-semibold text-surface-900 dark:text-surface-100">
          <Building2 size={18} className="text-brand-500" />
          Company research
        </span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {expanded && (
        <div className="p-4 pt-0 space-y-4">
          <p className="text-sm text-surface-500 dark:text-surface-400">
            {companyName} · {jobTitle}
          </p>
          {!research && !loading && !error && (
            <button
              type="button"
              onClick={generate}
              className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2"
            >
              Generate research summary
            </button>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-surface-500 dark:text-surface-400">
              <Loader2 size={18} className="animate-spin" />
              Generating company research…
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-sm">
              {error}
              <button type="button" onClick={generate} className="ml-2 underline">
                Retry
              </button>
            </div>
          )}
          {research && (
            <div className="space-y-4 text-sm">
              {research.overview && (
                <section>
                  <h4 className="font-medium text-surface-700 dark:text-surface-200 mb-1">Overview</h4>
                  <p className="text-surface-600 dark:text-surface-300">{research.overview}</p>
                </section>
              )}
              {research.recentNews && research.recentNews.length > 0 && (
                <section>
                  <h4 className="font-medium text-surface-700 dark:text-surface-200 mb-1">Recent news</h4>
                  <ul className="list-disc list-inside text-surface-600 dark:text-surface-300 space-y-0.5">
                    {research.recentNews.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
              {research.culture && research.culture.length > 0 && (
                <section>
                  <h4 className="font-medium text-surface-700 dark:text-surface-200 mb-1">Culture</h4>
                  <ul className="list-disc list-inside text-surface-600 dark:text-surface-300 space-y-0.5">
                    {research.culture.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
              {research.products && research.products.length > 0 && (
                <section>
                  <h4 className="font-medium text-surface-700 dark:text-surface-200 mb-1">Products & services</h4>
                  <ul className="list-disc list-inside text-surface-600 dark:text-surface-300 space-y-0.5">
                    {research.products.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
              {research.competitors && research.competitors.length > 0 && (
                <section>
                  <h4 className="font-medium text-surface-700 dark:text-surface-200 mb-1">Competitors</h4>
                  <p className="text-surface-600 dark:text-surface-300">{research.competitors.join(', ')}</p>
                </section>
              )}
              {research.questionsToAsk && research.questionsToAsk.length > 0 && (
                <section>
                  <h4 className="font-medium text-surface-700 dark:text-surface-200 mb-1">Questions to ask</h4>
                  <ul className="list-disc list-inside text-surface-600 dark:text-surface-300 space-y-0.5">
                    {research.questionsToAsk.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
