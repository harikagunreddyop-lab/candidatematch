'use client';

import Image from 'next/image';
import { Building2, MapPin, Bookmark, BookmarkCheck, ExternalLink, Share2, GitCompare, Star, Navigation, UserPlus, Sparkles, Clock, Layers } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface JobCardJob {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  url?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  job_type?: string | null;
  remote_type?: string | null;
  scraped_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  match_score?: number;
  match_reasons?: string[];
  must_have_skills?: string[];
  /** When true, show a Referral badge (e.g. from recruiter or internal referral data). */
  referral_available?: boolean;
  /** Optional URL to company logo image. */
  company_logo_url?: string | null;
  jd_excerpt?: string | null;
}

export interface JobCardProps {
  job: JobCardJob;
  isSaved?: boolean;
  isApplied?: boolean;
  isComparing?: boolean;
  onSave?: (jobId: string) => void;
  onUnsave?: (jobId: string) => void;
  onApply?: (job: JobCardJob) => void;
  onCompare?: (job: JobCardJob) => void;
  /** When provided, shows a "Similar jobs" button that fetches and displays similar roles. */
  onSeeSimilar?: (job: JobCardJob) => void;
  className?: string;
}

function formatSalary(min: number | null | undefined, max: number | null | undefined): string {
  if (min != null && max != null) return `$${(min / 1000).toFixed(0)}k – $${(max / 1000).toFixed(0)}k`;
  if (min != null) return `$${(min / 1000).toFixed(0)}k+`;
  if (max != null) return `Up to $${(max / 1000).toFixed(0)}k`;
  return '';
}

export function JobCard({
  job,
  isSaved = false,
  isApplied = false,
  onSave,
  onUnsave,
  onApply,
  onCompare,
  onSeeSimilar,
  isComparing,
  className,
}: JobCardProps) {
  const salaryStr = formatSalary(job.salary_min, job.salary_max);
  const applyUrl = job.url || '#';
  const isExternal = applyUrl.startsWith('http');
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
  const scrapedAt = job.scraped_at ? new Date(job.scraped_at).getTime() : 0;
  const expiresAt = job.expires_at ? new Date(job.expires_at).getTime() : 0;
  const isNewJob = scrapedAt >= sevenDaysAgo;
  const isClosingSoon = expiresAt > 0 && expiresAt <= sevenDaysFromNow && expiresAt >= now;
  const companyReviewsUrl = job.company
    ? `https://www.glassdoor.com/Reviews/index.htm?keyword=${encodeURIComponent(job.company.trim())}`
    : null;
  const directionsUrl =
    job.location && job.location.trim()
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.location.trim())}`
      : null;

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: job.title,
        text: `${job.title} at ${job.company}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard?.writeText(window.location.href);
    }
  };

  return (
    <article
      className={cn(
        'rounded-2xl border border-surface-300 bg-surface-50 p-5 shadow-card hover:-translate-y-0.5 hover:border-brand-300 hover:bg-surface-100 hover:shadow-elevated transition-all duration-200',
        className
      )}
    >
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-xl border border-surface-300 bg-surface-100 flex items-center justify-center shrink-0 overflow-hidden">
          {job.company_logo_url ? (
            <Image
              src={job.company_logo_url}
              alt=""
              width={48}
              height={48}
              className="w-full h-full object-cover"
              loading="lazy"
              unoptimized
            />
          ) : (
            <Building2 className="w-6 h-6 text-surface-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-xl font-extrabold text-surface-900">{job.title || 'Untitled'}</h3>
                {isNewJob && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-medium" title="Posted in the last 7 days">
                    <Sparkles size={10} />
                    New
                  </span>
                )}
                {isClosingSoon && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-xs font-medium" title="Application closing soon">
                    <Clock size={10} />
                    Closing soon
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm font-semibold text-surface-700">{job.company || '—'}</p>
            </div>
            {job.match_score != null && (
              <div
                className={cn(
                  'shrink-0 px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums',
                  job.match_score >= 80
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : job.match_score >= 60
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-surface-600 text-surface-300'
                )}
                title="Match score"
              >
                {job.match_score}%
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-semibold text-white">
            {job.location && (
                  <span className="flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-xs font-semibold text-surface-700">
                <MapPin size={12} />
                {job.location}
              </span>
            )}
            {job.remote_type && (
              <span className="rounded-full bg-surface-100 px-2 py-0.5 text-xs font-semibold capitalize text-surface-700">
                {job.remote_type}
              </span>
            )}
            {job.referral_available && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 text-xs">
                <UserPlus size={10} />
                Referral
              </span>
            )}
            {salaryStr && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-200">{salaryStr}</span>}
          </div>

          {job.match_reasons && job.match_reasons.length > 0 && (
            <ul className="mt-2 text-xs text-surface-600 space-y-0.5">
              {job.match_reasons.slice(0, 3).map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          )}

          {job.jd_excerpt && (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-surface-700">
              {job.jd_excerpt}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-surface-300 pt-2.5">
            {onApply && !isApplied && (
              <button
                type="button"
                onClick={() => onApply(job)}
                className="btn-primary text-xs py-1.5 px-3 rounded-lg inline-flex items-center gap-1.5"
              >
                One-click apply
              </button>
            )}
            {isApplied && (
              <span className="text-sm text-emerald-400 font-medium">Applied</span>
            )}
            {isExternal && (
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs py-1.5 px-3 rounded-lg inline-flex items-center gap-1.5 text-surface-600 hover:text-surface-900"
              >
                View job
                <ExternalLink size={14} />
              </a>
            )}
            {companyReviewsUrl && (
              <a
                href={companyReviewsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs py-1.5 px-3 rounded-lg inline-flex items-center gap-1.5 text-surface-600 hover:text-surface-900"
                title="Company reviews (Glassdoor)"
              >
                <Star size={14} />
                Reviews
              </a>
            )}
            {directionsUrl && (
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs py-1.5 px-3 rounded-lg inline-flex items-center gap-1.5 text-surface-600 hover:text-surface-900"
                title="Get directions (Google Maps)"
              >
                <Navigation size={14} />
                Directions
              </a>
            )}
            {onSave && !isSaved && (
              <button
                type="button"
                onClick={() => onSave(job.id)}
                className="p-2 rounded-lg hover:bg-surface-200 text-surface-500 hover:text-surface-800"
                title="Save job"
              >
                <Bookmark size={16} />
              </button>
            )}
            {isSaved && onUnsave && (
              <button
                type="button"
                onClick={() => onUnsave(job.id)}
                className="p-2 rounded-lg hover:bg-surface-200 text-brand-600"
                title="Unsave job"
              >
                <BookmarkCheck size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={handleShare}
              className="p-2 rounded-lg hover:bg-surface-200 text-surface-500 hover:text-surface-800"
              title="Share"
            >
              <Share2 size={16} />
            </button>
            {onCompare && (
              <button
                type="button"
                onClick={() => onCompare(job)}
                className={cn(
                  'p-2 rounded-lg hover:bg-surface-200 transition-colors',
                  isComparing ? 'text-brand-700 bg-brand-500/15' : 'text-surface-500 hover:text-surface-800'
                )}
                title={isComparing ? 'Remove from comparison' : 'Add to comparison'}
              >
                <GitCompare size={16} />
              </button>
            )}
            {onSeeSimilar && (
              <button
                type="button"
                onClick={() => onSeeSimilar(job)}
                className="p-2 rounded-lg hover:bg-surface-200 text-surface-500 hover:text-surface-800"
                title="See similar jobs"
              >
                <Layers size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
