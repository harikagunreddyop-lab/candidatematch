'use client';
// Productivity-focused recruiter dashboard: AI task prioritization, quick actions, goals, follow-ups.

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { Briefcase, Users, Plus, Sparkles, HelpCircle } from 'lucide-react';
import {
  QuickActionsPanel,
  DailyTaskList,
  FollowUpQueue,
  PerformanceGoalsWidget,
  UpcomingInterviewsCalendar,
  ActivityTimeline,
  LeaderboardPositionCard,
  useKeyboardShortcuts,
  KeyboardShortcutsPanel,
  CommandPalette,
  BulkFollowUpModal,
} from '@/components/recruiter-dashboard';

export default function RecruiterDashboard() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showBulkFollowUp, setShowBulkFollowUp] = useState(false);
  const [data, setData] = useState<{
    jobCount: number;
    myJobs: { id: string; title: string; is_active: boolean; applications_count: number }[];
    newMatches: any[];
    applications: any[];
    totalApplicationsCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useKeyboardShortcuts({
    onHelp: () => setShowShortcuts((s) => !s),
    onEscape: () => {
      setShowShortcuts(false);
      setShowCommandPalette(false);
      setShowBulkFollowUp(false);
    },
    onCommandPalette: () => setShowCommandPalette((s) => !s),
  });

  useEffect(() => {
    loadDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  async function loadDashboard() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const userId = session.user.id;
    const { data: roleCtx } = await supabase
      .from('profile_roles')
      .select('company_id')
      .eq('id', userId)
      .single();
    const companyId = roleCtx?.company_id;
    if (!companyId) {
      setData({
        jobCount: 0,
        myJobs: [],
        newMatches: [],
        applications: [],
        totalApplicationsCount: 0,
      });
      setLoading(false);
      return;
    }

    const { data: myJobs, count: jobCount } = await supabase
      .from('jobs')
      .select('id, title, is_active, applications_count', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const jobIds = (myJobs || []).map((j: any) => j.id);

    if (jobIds.length === 0) {
      setData({
        jobCount: 0,
        myJobs: [],
        newMatches: [],
        applications: [],
        totalApplicationsCount: 0,
      });
      setLoading(false);
      return;
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const [newMatchesRes, applicationsRes, appCountRes] = await Promise.all([
      supabase
        .from('candidate_job_matches')
        .select(`
          id, fit_score, candidate_id, job_id, matched_at,
          candidate:candidates(id, full_name, email, primary_title),
          job:jobs(id, title)
        `)
        .in('job_id', jobIds)
        .gte('matched_at', yesterday)
        .gte('fit_score', 70)
        .order('fit_score', { ascending: false })
        .limit(10),
      supabase
        .from('applications')
        .select(`
          id, candidate_id, job_id, status, created_at,
          candidate:candidates(full_name, primary_title),
          job:jobs(id, title)
        `)
        .in('job_id', jobIds)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .in('job_id', jobIds),
    ]);

    setData({
      jobCount: jobCount ?? 0,
      myJobs: (myJobs || []) as { id: string; title: string; is_active: boolean; applications_count: number }[],
      newMatches: newMatchesRes.data || [],
      applications: applicationsRes.data || [],
      totalApplicationsCount: appCountRes.count ?? 0,
    });
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const { jobCount, myJobs, newMatches, totalApplicationsCount } = data || {
    jobCount: 0,
    myJobs: [],
    newMatches: [],
    totalApplicationsCount: 0,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">My Dashboard</h1>
          <p className="text-surface-400 mt-1">{jobCount} active company jobs</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCommandPalette(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-600 text-surface-400 hover:text-white hover:bg-surface-200/50 transition-colors"
            title="Command palette"
          >
            <span className="text-sm hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-surface-700 text-xs">⌘K</kbd>
          </button>
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-600 text-surface-400 hover:text-white hover:bg-surface-200/50 transition-colors"
            title="Keyboard shortcuts"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">Shortcuts</span>
          </button>
          <Link
            href="/dashboard/recruiter/jobs/new"
            className="flex items-center gap-2 px-4 py-2 bg-brand-400 hover:bg-brand-300 text-[#0a0f00] rounded-lg font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Post Job
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <QuickActionsPanel />

      {/* Main grid: tasks + goals + interviews + leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DailyTaskList />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FollowUpQueue onBulkFollowUp={() => setShowBulkFollowUp(true)} />
            <UpcomingInterviewsCalendar />
          </div>
        </div>
        <div className="space-y-6">
          <PerformanceGoalsWidget />
          <LeaderboardPositionCard />
        </div>
      </div>

      {/* Activity timeline */}
      <ActivityTimeline />

      {/* Legacy: KPIs + New Matches + My Jobs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          label="Active Company Jobs"
          value={jobCount}
          icon={<Briefcase className="w-5 h-5" />}
          color="from-brand-400 to-brand-600"
          href="/dashboard/recruiter/jobs"
        />
        <KPICard
          label="New Matches (24h)"
          value={newMatches.length}
          icon={<Sparkles className="w-5 h-5" />}
          color="from-emerald-500 to-teal-600"
          href="/dashboard/recruiter/candidates"
        />
        <KPICard
          label="Total Applications"
          value={totalApplicationsCount}
          icon={<Users className="w-5 h-5" />}
          color="from-brand-500 to-brand-700"
          href="/dashboard/recruiter/pipeline"
        />
      </div>

      {newMatches.length > 0 && (
        <div className="bg-surface-100 border border-surface-700/60 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">New Matches</h2>
            <Link href="/dashboard/recruiter/candidates" className="text-sm text-brand-400 hover:text-brand-300">
              View All →
            </Link>
          </div>
          <div className="space-y-3">
            {newMatches.map((match: any) => (
              <Link
                key={match.id}
                href={`/dashboard/recruiter/candidates/${match.candidate_id}`}
                className="flex items-center justify-between p-4 bg-surface-200/50 rounded-lg hover:bg-surface-200 transition-colors"
              >
                <div className="flex-1">
                  <div className="font-medium text-white">
                    {(match.candidate && !Array.isArray(match.candidate))
                      ? (match.candidate as any).full_name
                      : Array.isArray(match.candidate)
                        ? (match.candidate[0] as any)?.full_name
                        : '—'}
                  </div>
                  <div className="text-xs text-surface-500 mt-1">
                    {(match.candidate && !Array.isArray(match.candidate))
                      ? (match.candidate as any).primary_title
                      : Array.isArray(match.candidate)
                        ? (match.candidate[0] as any)?.primary_title
                        : ''}
                    {' • For: '}
                    {(match.job && !Array.isArray(match.job))
                      ? (match.job as any).title
                      : Array.isArray(match.job)
                        ? (match.job[0] as any)?.title
                        : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-emerald-400">{match.fit_score}% Match</div>
                    <div className="text-xs text-surface-500">Fit Score</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface-100 border border-surface-700/60 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Company Jobs</h2>
          <Link href="/dashboard/recruiter/jobs" className="text-sm text-brand-400 hover:text-brand-300">
            View All →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {myJobs.length === 0 ? (
            <p className="text-surface-500 text-sm col-span-2">No jobs yet. Post a job to see matches and applications.</p>
          ) : (
            myJobs.map((job: any) => (
              <Link
                key={job.id}
                href={`/dashboard/recruiter/jobs/${job.id}`}
                className="p-4 bg-surface-200/50 rounded-lg hover:bg-surface-200 transition-colors"
              >
                <div className="font-medium text-white">{job.title}</div>
                <div className="text-xs text-surface-500 mt-2">
                  {job.applications_count || 0} applications
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {showShortcuts && <KeyboardShortcutsPanel onClose={() => setShowShortcuts(false)} />}
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onShowShortcuts={() => setShowShortcuts(true)}
      />
      <BulkFollowUpModal open={showBulkFollowUp} onClose={() => setShowBulkFollowUp(false)} />
    </div>
  );
}

function KPICard({
  label,
  value,
  icon,
  color,
  href,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  href: string;
}) {
  return (
    <Link href={href} className="group">
      <div className={`bg-gradient-to-br ${color} p-[1px] rounded-xl transition-all hover:scale-[1.02]`}>
        <div className="bg-surface-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className={`bg-gradient-to-br ${color} bg-opacity-10 p-2 rounded-lg text-white`}>
              {icon}
            </div>
          </div>
          <div className="text-3xl font-bold text-white">{value}</div>
          <div className="text-sm font-medium text-surface-300 mt-1">{label}</div>
        </div>
      </div>
    </Link>
  );
}
