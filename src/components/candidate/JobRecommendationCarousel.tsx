'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Sparkles, MapPin, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { Skeleton } from '@/components/ui';
import { formatRelative } from '@/utils/helpers';

export interface JobRecommendationItem {
  id: string;
  jobId: string;
  score: number;
  matchReason: string | null;
  matchedKeywords: string[];
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    remoteType: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    scrapedAt: string | null;
  } | null;
}

export interface JobRecommendationCarouselProps {
  recommendations: JobRecommendationItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onCtaClick?: (jobId: string) => void;
}

function formatSalary(min: number | null, max: number | null): string {
  if (min != null && max != null) return `$${(min / 1000).toFixed(0)}k–$${(max / 1000).toFixed(0)}k`;
  if (min != null) return `$${(min / 1000).toFixed(0)}k+`;
  if (max != null) return `Up to $${(max / 1000).toFixed(0)}k`;
  return '';
}

export function JobRecommendationCarousel({
  recommendations,
  loading,
  error,
  onRetry,
  onCtaClick,
}: JobRecommendationCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const step = 320;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-72 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="bg-surface-800 rounded-xl p-6 border border-surface-700/60 text-center"
        role="alert"
      >
        <p className="text-surface-400 mb-2">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm text-brand-400 hover:text-brand-300 font-medium"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="bg-surface-800 rounded-xl p-8 border border-surface-700/60 text-center">
        <Sparkles className="w-12 h-12 text-surface-600 mx-auto mb-3" />
        <p className="text-surface-400 mb-2">No new recommendations right now.</p>
        <p className="text-sm text-surface-500">Complete your profile and browse jobs to get AI-powered matches.</p>
        <Link
          href="/dashboard/candidate/jobs"
          className="inline-block mt-4 text-brand-400 hover:text-brand-300 font-medium"
        >
          Browse jobs →
        </Link>
      </div>
    );
  }

  return (
    <div className="relative" role="region" aria-label="Job recommendations carousel">
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto overflow-y-hidden scroll-smooth scrollbar-none pb-2 -mx-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {recommendations.map((rec) => (
          <Link
            key={rec.id}
            href="/dashboard/candidate/matches"
            onClick={() => onCtaClick?.(rec.jobId)}
            className={cn(
              'flex-shrink-0 w-72 rounded-xl border border-surface-700/60 bg-surface-800 p-4',
              'hover:border-brand-400/50 transition-colors block',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900'
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-semibold text-white line-clamp-2">{rec.job?.title}</h4>
              <span className="px-2 py-0.5 rounded-full bg-brand-400/10 text-brand-400 text-xs font-semibold shrink-0 ml-2">
                {rec.score}%
              </span>
            </div>
            {rec.job?.company && (
              <p className="text-surface-400 text-sm mb-2">{rec.job.company}</p>
            )}
            <div className="flex flex-wrap gap-2 text-xs text-surface-500 mb-2">
              {rec.job?.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {rec.job.location}
                </span>
              )}
              {(rec.job?.salaryMin != null || rec.job?.salaryMax != null) && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />{' '}
                  {formatSalary(rec.job?.salaryMin ?? null, rec.job?.salaryMax ?? null)}
                </span>
              )}
            </div>
            {rec.matchReason && (
              <p className="text-xs text-surface-400 line-clamp-2 mt-1">{rec.matchReason}</p>
            )}
            {rec.job?.scrapedAt && (
              <p className="text-xs text-surface-500 mt-2">{formatRelative(rec.job.scrapedAt)}</p>
            )}
          </Link>
        ))}
      </div>
      {recommendations.length > 2 && (
        <>
          <button
            type="button"
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-10 h-10 rounded-full bg-surface-800 border border-surface-700 shadow-lg flex items-center justify-center text-surface-300 hover:text-white hover:border-brand-400/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-10 h-10 rounded-full bg-surface-800 border border-surface-700 shadow-lg flex items-center justify-center text-surface-300 hover:text-white hover:border-brand-400/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
}
