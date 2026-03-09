'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Briefcase, Sparkles, ClipboardList, TrendingUp, Calendar } from 'lucide-react';
import { useCandidate, useMatches, useApplications } from '@/hooks';
import { createClient } from '@/lib/supabase-browser';
import { posthogAnalytics } from '@/lib/analytics-posthog';
import { DashboardErrorBoundary } from '@/components/layout/DashboardErrorBoundary';
import { Skeleton } from '@/components/ui';
import {
  DashboardMetricCard,
  GoalsProgressWidget,
  QuickActionsPanel,
  JobRecommendationCarousel,
  UpcomingEventsWidget,
} from '@/components/candidate';
import type { JobRecommendationItem } from '@/components/candidate/JobRecommendationCarousel';
import type { UpcomingEventItem } from '@/components/candidate/UpcomingEventsWidget';

const MatchesList = dynamic(
  () => import('@/components/candidate/MatchesList').then((m) => ({ default: m.MatchesList })),
  { loading: () => <Skeleton className="h-40 w-full rounded-xl" /> }
);

const ApplicationsList = dynamic(
  () => import('@/components/candidate/ApplicationsList').then((m) => ({ default: m.ApplicationsList })),
  { loading: () => <Skeleton className="h-48 w-full rounded-xl" /> }
);

const WEEKLY_GOAL_DEFAULT = 5;
const DEBUG_ENDPOINT = 'http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50';
const DEBUG_SESSION_ID = 'f6067c';
const DEBUG_RUN_ID = 'candidate-dashboard-run1';

function trackDashboardCta(cta: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  posthogAnalytics.track('dashboard_cta_clicked', { cta, ...props });
}

export default function CandidateDashboard() {
  const { candidate, loading: candidateLoading } = useCandidate();
  const { matches, loading: matchesLoading, refresh: refreshMatches } = useMatches(candidate?.id ?? null);
  const { applications, loading: appsLoading, refresh: refreshApplications } = useApplications(candidate?.id ?? null);

  const [stats, setStats] = useState<{
    applicationsTotal: number;
    applicationsByStatus: Record<string, number>;
    activeMatches: number;
    interviewsUpcoming: number;
    interviewsPast: number;
    profileCompletionPercent: number;
    daysSinceLastApplication: number | null;
    averageMatchScore: number;
    applicationsThisWeek: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [_statsError, setStatsError] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<JobRecommendationItem[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [recsError, setRecsError] = useState<string | null>(null);

  const [upcoming, setUpcoming] = useState<UpcomingEventItem[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setStatsError(null);
      const res = await fetch('/api/candidate/dashboard/stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load stats');
      const data = await res.json();
      // #region agent log
      fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H2',location:'src/app/dashboard/candidate/page.tsx:76',message:'fetchStats success',data:{applicationsTotal:data?.applicationsTotal??0,activeMatches:data?.activeMatches??0,averageMatchScore:data?.averageMatchScore??0},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setStats(data);
    } catch (e) {
      // #region agent log
      fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H2',location:'src/app/dashboard/candidate/page.tsx:81',message:'fetchStats failed',data:{error:e instanceof Error ? e.message : 'unknown'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setStatsError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchRecommendations = useCallback(async () => {
    try {
      setRecsError(null);
      const res = await fetch('/api/candidate/dashboard/recommendations', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load recommendations');
      const data = await res.json();
      // #region agent log
      fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H2',location:'src/app/dashboard/candidate/page.tsx:98',message:'fetchRecommendations success',data:{recommendationCount:Array.isArray(data?.recommendations)?data.recommendations.length:0},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setRecommendations(data.recommendations ?? []);
    } catch (e) {
      // #region agent log
      fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H2',location:'src/app/dashboard/candidate/page.tsx:103',message:'fetchRecommendations failed',data:{error:e instanceof Error ? e.message : 'unknown'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setRecsError(e instanceof Error ? e.message : 'Failed to load recommendations');
    } finally {
      setRecsLoading(false);
    }
  }, []);

  const fetchUpcoming = useCallback(async () => {
    try {
      setUpcomingError(null);
      const res = await fetch('/api/candidate/dashboard/upcoming', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load upcoming');
      const data = await res.json();
      // #region agent log
      fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H2',location:'src/app/dashboard/candidate/page.tsx:120',message:'fetchUpcoming success',data:{upcomingCount:Array.isArray(data?.upcoming)?data.upcoming.length:0},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setUpcoming(data.upcoming ?? []);
    } catch (e) {
      // #region agent log
      fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H2',location:'src/app/dashboard/candidate/page.tsx:125',message:'fetchUpcoming failed',data:{error:e instanceof Error ? e.message : 'unknown'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setUpcomingError(e instanceof Error ? e.message : 'Failed to load upcoming');
    } finally {
      setUpcomingLoading(false);
    }
  }, []);

  useEffect(() => {
    // #region agent log
    fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H4',location:'src/app/dashboard/candidate/page.tsx:135',message:'dashboard candidate gate check',data:{candidateLoading,candidateIdPresent:Boolean(candidate?.id)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!candidate?.id) return;
    fetchStats();
    fetchRecommendations();
    fetchUpcoming();
  }, [candidate?.id, candidateLoading, fetchStats, fetchRecommendations, fetchUpcoming]);

  // Real-time: refetch when applications or matches change
  useEffect(() => {
    if (!candidate?.id) return;
    const supabase = createClient();
    const applicationsChannel = supabase
      .channel('dashboard-applications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applications',
          filter: `candidate_id=eq.${candidate.id}`,
        },
        () => {
          refreshApplications();
          fetchStats();
          fetchUpcoming();
        }
      )
      .subscribe();

    const matchesChannel = supabase
      .channel('dashboard-matches')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'candidate_job_matches',
          filter: `candidate_id=eq.${candidate.id}`,
        },
        () => {
          refreshMatches();
          fetchStats();
          fetchRecommendations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(applicationsChannel);
      supabase.removeChannel(matchesChannel);
    };
  }, [candidate?.id, refreshApplications, refreshMatches, fetchStats, fetchRecommendations, fetchUpcoming]);

  useEffect(() => {
    if (candidateLoading || !candidate?.id) return;
    // #region agent log
    fetch(DEBUG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:DEBUG_SESSION_ID,runId:DEBUG_RUN_ID,hypothesisId:'H5',location:'src/app/dashboard/candidate/page.tsx:188',message:'dashboard state snapshot',data:{matchesCount:matches.length,applicationsCount:applications.length,statsActiveMatches:stats?.activeMatches??null,statsAvgMatch:stats?.averageMatchScore??null,statsLoading,matchesLoading,appsLoading,recsLoading,upcomingLoading},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [candidateLoading, candidate?.id, matches.length, applications.length, stats?.activeMatches, stats?.averageMatchScore, statsLoading, matchesLoading, appsLoading, recsLoading, upcomingLoading]);

  if (candidateLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
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

  return (
    <DashboardErrorBoundary sectionName="Dashboard">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Welcome back, {candidate.full_name || 'there'}
            </h1>
            <p className="text-surface-400 mt-1">Here&apos;s your job search at a glance</p>
          </div>
          <Link
            href="/dashboard/candidate/jobs"
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-400 hover:bg-brand-300 text-[#0a0f00] rounded-lg font-semibold transition-colors shrink-0"
            aria-label="Browse jobs"
            onClick={() => trackDashboardCta('browse_jobs')}
          >
            <Briefcase className="w-4 h-4" />
            Browse Jobs
          </Link>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardMetricCard
            label="Applications"
            value={statsLoading ? '—' : (stats?.applicationsTotal ?? 0)}
            icon={<ClipboardList className="w-5 h-5" />}
            iconClassName="bg-blue-500/10 text-blue-400"
            href="/dashboard/candidate/applications"
            loading={statsLoading}
            aria-label={`Applications: ${stats?.applicationsTotal ?? 0}`}
            onCtaClick={() => trackDashboardCta('metric_applications')}
          />
          <DashboardMetricCard
            label="AI Matches"
            value={matchesLoading ? '—' : matches.length}
            icon={<Sparkles className="w-5 h-5" />}
            iconClassName="bg-brand-400/10 text-brand-400"
            href="/dashboard/candidate/matches"
            loading={matchesLoading}
            aria-label={`AI matches: ${matches.length}`}
            onCtaClick={() => trackDashboardCta('metric_matches')}
          />
          <DashboardMetricCard
            label="Interviews"
            value={statsLoading ? '—' : (stats?.interviewsUpcoming ?? 0) + (stats?.interviewsPast ?? 0)}
            subtext={stats && stats.interviewsUpcoming > 0 ? `${stats.interviewsUpcoming} upcoming` : undefined}
            icon={<Calendar className="w-5 h-5" />}
            iconClassName="bg-emerald-500/10 text-emerald-400"
            href="/dashboard/candidate/applications"
            loading={statsLoading}
            aria-label={`Interviews: ${(stats?.interviewsUpcoming ?? 0) + (stats?.interviewsPast ?? 0)}`}
            onCtaClick={() => trackDashboardCta('metric_interviews')}
          />
          <DashboardMetricCard
            label="Avg Match Score"
            value={statsLoading ? '—' : `${stats?.averageMatchScore ?? 0}%`}
            icon={<TrendingUp className="w-5 h-5" />}
            iconClassName="bg-amber-500/10 text-amber-400"
            loading={statsLoading}
            aria-label={`Average match score: ${stats?.averageMatchScore ?? 0}%`}
          />
        </div>

        {/* Quick actions */}
        <QuickActionsPanel
          loading={false}
          onActionClick={(label) => trackDashboardCta('quick_action', { action: label })}
        />

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section aria-labelledby="recommendations-heading">
              <div className="flex items-center justify-between mb-4">
                <h2 id="recommendations-heading" className="text-lg font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-brand-400" />
                  Recommended for you
                </h2>
                <Link
                  href="/dashboard/candidate/matches"
                  className="text-sm text-brand-400 hover:text-brand-300"
                  onClick={() => trackDashboardCta('view_all_matches')}
                >
                  View all matches →
                </Link>
              </div>
              <JobRecommendationCarousel
                recommendations={recommendations}
                loading={recsLoading}
                error={recsError}
                onRetry={fetchRecommendations}
                onCtaClick={(jobId) => trackDashboardCta('recommendation_card', { job_id: jobId })}
              />
            </section>

            <section aria-labelledby="recent-activity-heading">
              <div className="flex items-center justify-between mb-4">
                <h2 id="recent-activity-heading" className="text-lg font-semibold text-white">
                  Recent Applications
                </h2>
                <Link
                  href="/dashboard/candidate/applications"
                  className="text-sm text-brand-400 hover:text-brand-300"
                  onClick={() => trackDashboardCta('view_all_applications')}
                >
                  View all →
                </Link>
              </div>
              {appsLoading ? (
                <Skeleton className="h-48 w-full rounded-xl" />
              ) : (
                <ApplicationsList applications={applications.slice(0, 5)} />
              )}
            </section>
          </div>

          <div className="space-y-6">
            <UpcomingEventsWidget
              upcoming={upcoming}
              loading={upcomingLoading}
              error={upcomingError}
              onRetry={fetchUpcoming}
            />
            <GoalsProgressWidget
              profileCompletionPercent={stats?.profileCompletionPercent ?? 0}
              weeklyApplicationGoal={WEEKLY_GOAL_DEFAULT}
              applicationsThisWeek={stats?.applicationsThisWeek ?? 0}
              loading={statsLoading}
            />
          </div>
        </div>

        {/* Top matches */}
        <section aria-labelledby="top-matches-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="top-matches-heading" className="text-lg font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-400" />
              Top Matches
            </h2>
            <Link
              href="/dashboard/candidate/matches"
              className="text-sm text-brand-400 hover:text-brand-300"
              onClick={() => trackDashboardCta('view_all_top_matches')}
            >
              View all →
            </Link>
          </div>
          {matchesLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : (
            <MatchesList matches={matches.slice(0, 3)} />
          )}
        </section>
      </div>
    </DashboardErrorBoundary>
  );
}
