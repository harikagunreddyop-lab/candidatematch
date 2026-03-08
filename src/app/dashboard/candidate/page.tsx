'use client';

import { useCandidate, useMatches, useApplications } from '@/hooks';
import { DashboardStats } from '@/components/candidate/DashboardStats';
import { MatchesList } from '@/components/candidate/MatchesList';
import { ApplicationsList } from '@/components/candidate/ApplicationsList';
import { Skeleton } from '@/components/ui';
import Link from 'next/link';
import { Briefcase, Sparkles } from 'lucide-react';

export default function CandidateDashboard() {
  const { candidate, loading: candidateLoading } = useCandidate();
  const { matches, loading: matchesLoading } = useMatches(candidate?.id ?? null);
  const { applications, loading: appsLoading } = useApplications(candidate?.id ?? null);

  if (candidateLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Complete your profile</h2>
        <p className="text-surface-400 mb-6">Let&apos;s get your profile set up to find great opportunities</p>
        <Link href="/dashboard/candidate/onboarding" className="btn-primary">
          Get Started
        </Link>
      </div>
    );
  }

  const scoreOf = (m: { ats_score?: number | null; fit_score?: number }) =>
    typeof m?.ats_score === 'number' ? m.ats_score : typeof m?.fit_score === 'number' ? m.fit_score : 0;
  const stats = {
    matches: matches.length,
    applications: applications.length,
    interviews: applications.filter((a) => a.status === 'interview' || a.status === 'screening').length,
    averageScore:
      matches.length > 0 ? Math.round(matches.reduce((sum, m) => sum + scoreOf(m), 0) / matches.length) : 0,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Welcome back, {candidate.full_name || 'there'}
          </h1>
          <p className="text-surface-400 mt-1">Here&apos;s your job search progress</p>
        </div>
        <Link
          href="/dashboard/candidate/jobs"
          className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold transition-colors shrink-0"
        >
          <Briefcase className="w-4 h-4" />
          Browse Jobs
        </Link>
      </div>

      {/* Stats */}
      <DashboardStats stats={stats} />

      {/* Matches */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            <h2 className="text-xl font-semibold text-white">Top Matches</h2>
          </div>
          <Link
            href="/dashboard/candidate/matches"
            className="text-sm text-violet-400 hover:text-violet-300"
          >
            View all →
          </Link>
        </div>
        {matchesLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <MatchesList matches={matches.slice(0, 3)} />
        )}
      </div>

      {/* Applications */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Recent Applications</h2>
          <Link
            href="/dashboard/candidate/applications"
            className="text-sm text-violet-400 hover:text-violet-300"
          >
            View all →
          </Link>
        </div>
        {appsLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : (
          <ApplicationsList applications={applications.slice(0, 5)} />
        )}
      </div>
    </div>
  );
}
