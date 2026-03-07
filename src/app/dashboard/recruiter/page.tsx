'use client';
// B2B SaaS model: recruiter sees candidates matched to THEIR COMPANY'S jobs (no recruiter_candidate_assignments)
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient, subscribeWithLog } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { Users, Briefcase, ChevronRight, Star, Calendar, Sparkles, Bell, TrendingUp, Zap } from 'lucide-react';
import { cn } from '@/utils/helpers';

function scoreColor(score: number) {
  if (score >= 85) return 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20 dark:ring-emerald-400/30';
  if (score >= 70) return 'bg-brand-500/15 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 ring-1 ring-brand-500/20 dark:ring-brand-400/30';
  if (score >= 50) return 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20 dark:ring-amber-400/30';
  return 'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300';
}

export default function RecruiterDashboard() {
  const [pageData, setPageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const supabase = createClient();

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data: profile } = await supabase
      .from('profile_roles')
      .select('name, company_id')
      .eq('id', session.user.id)
      .single();

    if (!profile?.company_id) {
      setPageData({
        profile: { name: profile?.name },
        noCompany: true,
        companyJobsCount: 0,
        candList: [],
        newMatches: [],
        newMatchesTotal: 0,
        todayInterviews: [],
        pipeline: {},
        totalCandidates: 0,
      });
      setLoading(false);
      return;
    }

    const { data: companyJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('company_id', profile.company_id)
      .eq('is_active', true);

    const jobIds = (companyJobs || []).map((j: any) => j.id);
    if (jobIds.length === 0) {
      setPageData({
        profile: { name: profile.name, company_id: profile.company_id },
        noCompany: false,
        companyJobsCount: 0,
        candList: [],
        newMatches: [],
        newMatchesTotal: 0,
        todayInterviews: [],
        pipeline: { ready: 0, applied: 0, screening: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 },
        totalCandidates: 0,
      });
      setLoading(false);
      return;
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [newMatchCountRes, newMatchListRes, interviewRes, appRes, matchCandRes] = await Promise.all([
      supabase.from('candidate_job_matches')
        .select('id', { count: 'exact', head: true })
        .in('job_id', jobIds)
        .gte('matched_at', yesterday),
      supabase.from('candidate_job_matches')
        .select('id, fit_score, candidate_id, matched_at, job:jobs(title, company), candidate:candidates(full_name)')
        .in('job_id', jobIds)
        .gte('matched_at', yesterday)
        .order('fit_score', { ascending: false })
        .limit(5),
      supabase.from('applications')
        .select('id, candidate_id, interview_date, candidate:candidates(full_name), job:jobs(title, company)')
        .in('job_id', jobIds)
        .eq('status', 'interview')
        .gte('interview_date', todayStart.toISOString())
        .lt('interview_date', todayEnd.toISOString()),
      supabase.from('applications')
        .select('status')
        .in('job_id', jobIds),
      supabase.from('candidate_job_matches')
        .select('candidate_id')
        .in('job_id', jobIds)
        .limit(500),
    ]);

    const pipeline: Record<string, number> = { ready: 0, applied: 0, screening: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 };
    for (const app of appRes.data || []) {
      pipeline[app.status] = (pipeline[app.status] || 0) + 1;
    }

    const candidateIdsFromMatches = new Set((matchCandRes.data || []).map((m: any) => m.candidate_id));
    const candidateIdsFromApps = new Set((appRes.data || []).map((a: any) => a.candidate_id));
    const allCandidateIds = Array.from(new Set([...Array.from(candidateIdsFromMatches), ...Array.from(candidateIdsFromApps)]));

    let candList: any[] = [];
    if (allCandidateIds.length > 0) {
      const { data: cands } = await supabase
        .from('candidates')
        .select('id, full_name, primary_title, rating')
        .in('id', allCandidateIds.slice(0, 50))
        .order('full_name');
      candList = (cands || []).slice(0, 6);
    }

    const newMatchesTotal = newMatchCountRes.count ?? 0;
    setPageData({
      profile: { name: profile.name, company_id: profile.company_id },
      noCompany: false,
      companyJobsCount: jobIds.length,
      candList,
      newMatches: newMatchListRes.data || [],
      newMatchesTotal,
      todayInterviews: interviewRes.data || [],
      pipeline,
      totalCandidates: allCandidateIds.length,
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('recruiter-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidate_job_matches' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => load());
    subscribeWithLog(channel, 'recruiter-dashboard');
    return () => { supabase.removeChannel(channel); };
  }, [load, supabase]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Spinner size={32} className="text-brand-500" />
        <p className="text-sm text-surface-500 dark:text-surface-300 font-medium">Loading your pipeline...</p>
      </div>
    );
  }
  if (!pageData) return null;

  if (pageData.noCompany) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/10 p-8 text-center">
        <Briefcase className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-surface-900 dark:text-surface-100">No company linked</h2>
        <p className="text-surface-500 dark:text-surface-400 mt-2 text-sm">
          Your account is not linked to a company. Ask your company admin to invite you or add you to the team.
        </p>
        <Link href="/dashboard/company" className="inline-block mt-4 text-brand-600 dark:text-brand-400 font-medium text-sm hover:underline">Go to Company dashboard</Link>
      </div>
    );
  }

  const { profile, companyJobsCount, candList, newMatches, newMatchesTotal, todayInterviews, pipeline, totalCandidates } = pageData;
  const totalApps = Object.values(pipeline).reduce((a: any, b: any) => a + b, 0) as number;
  const firstName = profile?.name?.split(' ')[0] || 'Recruiter';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const STAGES = [
    { key: 'applied', label: 'Applied', color: 'text-blue-600 dark:text-blue-300', bg: 'bg-blue-500/10 dark:bg-blue-500/20' },
    { key: 'screening', label: 'Screening', color: 'text-amber-600 dark:text-amber-300', bg: 'bg-amber-500/10 dark:bg-amber-500/20' },
    { key: 'interview', label: 'Interview', color: 'text-violet-600 dark:text-violet-300', bg: 'bg-violet-500/10 dark:bg-violet-500/20' },
    { key: 'offer', label: 'Offer', color: 'text-emerald-600 dark:text-emerald-300', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20' },
    { key: 'rejected', label: 'Rejected', color: 'text-red-500 dark:text-red-300', bg: 'bg-red-500/10 dark:bg-red-500/20' },
    { key: 'ready', label: 'Ready', color: 'text-surface-500 dark:text-surface-400', bg: 'bg-surface-100 dark:bg-surface-700/50' },
    { key: 'withdrawn', label: 'Withdrawn', color: 'text-surface-400 dark:text-surface-500', bg: 'bg-surface-50 dark:bg-surface-700/30' },
  ];

  const BAR_COLORS: Record<string, string> = {
    applied: 'bg-blue-500', screening: 'bg-amber-500',
    interview: 'bg-violet-500', offer: 'bg-emerald-500',
  };

  return (
    <div className="space-y-8">
      <div className="hero-greeting px-4 sm:px-6 md:px-8 py-6 sm:py-8 md:py-10">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 md:gap-8">
          <div className="min-w-0 flex-1">
            <p className="hero-date text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] mb-2 sm:mb-3" style={{ color: 'var(--role-accent)' }}>
              {dateStr}
            </p>
            <h1 className="hero-title text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-[2.5rem] font-bold font-display tracking-tight text-white">
              {greeting}, {firstName}
            </h1>
            <p className="hero-subtitle text-sm text-white/60 mt-1.5 sm:mt-2">
              {newMatchesTotal > 0
                ? `${newMatchesTotal} new match${newMatchesTotal !== 1 ? 'es' : ''} to your jobs · ${companyJobsCount} active jobs`
                : `${totalCandidates} candidates for your jobs · ${totalApps} in pipeline`}
            </p>
          </div>
          <div className="hero-actions flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
            <Link href="/dashboard/recruiter/reports" className="hero-btn-icon p-2.5 sm:p-3 rounded-xl border border-white/10 text-white/70" title="Reports">
              <TrendingUp size={18} className="sm:w-5 sm:h-5" />
            </Link>
            <Link href="/dashboard/recruiter/jobs" className="hero-btn btn-secondary text-sm py-2.5 px-4 sm:px-5 rounded-xl">
              My Jobs
            </Link>
            <Link href="/dashboard/recruiter/pipeline" className="hero-btn btn-primary text-sm py-2.5 px-4 sm:px-5 flex items-center gap-2 rounded-xl">
              <Briefcase size={16} /> Pipeline
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { value: companyJobsCount, label: 'Active jobs', Icon: Briefcase, bg: 'bg-brand-500/10 dark:bg-brand-500/20', color: 'text-brand-600 dark:text-brand-400' },
          { value: newMatchesTotal, label: 'New matches', Icon: Sparkles, bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', color: 'text-emerald-600 dark:text-emerald-400' },
          { value: totalApps, label: 'In pipeline', Icon: Zap, bg: 'bg-violet-500/10 dark:bg-violet-500/20', color: 'text-violet-600 dark:text-violet-400' },
          { value: todayInterviews.length, label: 'Interviews today', Icon: Calendar, bg: 'bg-amber-500/10 dark:bg-amber-500/20', color: 'text-amber-600 dark:text-amber-400' },
        ].map((s) => (
          <div
            key={s.label}
            className="group rounded-2xl bg-surface-800 border border-surface-700/60 p-5 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center gap-3"
          >
            <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110', s.bg)}>
              <s.Icon size={22} className={s.color} />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-surface-100 tabular-nums font-display tracking-tight">{s.value}</p>
              <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-widest mt-1">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {(newMatchesTotal > 0 || todayInterviews.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {newMatchesTotal > 0 && (
            <Link
              href="/dashboard/recruiter/candidates"
              className="group rounded-2xl border border-brand-200 dark:border-brand-500/40 bg-gradient-to-r from-brand-50 to-white dark:from-brand-500/10 dark:to-surface-800 px-5 py-4 flex items-center gap-4 shadow-sm hover:shadow-md hover:border-brand-300 dark:hover:border-brand-500/50 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 dark:bg-brand-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Bell size={20} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-brand-700 dark:text-brand-300 uppercase tracking-wide">New matches</p>
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                  {newMatchesTotal} new match{newMatchesTotal !== 1 ? 'es' : ''} to your jobs since yesterday
                </p>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Review candidates matched to your open roles</p>
              </div>
              <ChevronRight size={18} className="text-brand-500 dark:text-brand-400 shrink-0 group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
          {todayInterviews.length > 0 && (
            <div className="rounded-2xl border border-violet-200 dark:border-violet-500/40 bg-gradient-to-r from-violet-50 to-white dark:from-violet-500/10 dark:to-surface-800 px-5 py-4 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 dark:bg-violet-500/30 flex items-center justify-center shrink-0">
                <Calendar size={20} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">Today</p>
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                  {todayInterviews.length} interview{todayInterviews.length !== 1 ? 's' : ''} today
                </p>
                <p className="text-xs text-surface-500 dark:text-surface-400 truncate mt-0.5">
                  {todayInterviews.map((i: any) => i.candidate?.full_name).join(', ')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {totalApps > 0 && (
        <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center">
                  <TrendingUp size={18} className="text-violet-600 dark:text-violet-400" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display">Pipeline snapshot</h3>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Applications to your company&apos;s jobs</p>
                </div>
              </div>
              <Link href="/dashboard/recruiter/pipeline" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1 transition-colors">
                Full board <ChevronRight size={14} />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            {STAGES.map(s => (
              <div key={s.key} className={cn('rounded-xl p-3 text-center border border-surface-100 dark:border-surface-600', s.bg)}>
                <p className={cn('text-2xl font-bold tabular-nums font-display', s.color)}>{pipeline[s.key] || 0}</p>
                <p className="text-xs font-semibold text-surface-600 dark:text-surface-300 mt-0.5 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex rounded-full overflow-hidden h-2.5 bg-surface-100 dark:bg-surface-700">
            {['applied', 'screening', 'interview', 'offer'].map(stage => {
              const pct = totalApps > 0 ? ((pipeline[stage] || 0) / totalApps) * 100 : 0;
              return pct > 0 ? <div key={stage} style={{ width: `${pct}%` }} className={cn('h-full transition-all duration-300', BAR_COLORS[stage])} /> : null;
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden shadow-sm">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-100 dark:border-surface-700 flex items-center justify-between bg-surface-50/50 dark:bg-surface-700/30">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-brand-500/10 dark:bg-brand-500/20 flex items-center justify-center shrink-0">
                <Sparkles size={18} className="text-brand-600 dark:text-brand-400" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display">New matches</h3>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Candidates matched to your jobs · since yesterday</p>
              </div>
            </div>
            <Link href="/dashboard/recruiter/candidates" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1 transition-colors">
              All candidates <ChevronRight size={12} />
            </Link>
          </div>
          {newMatches.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-surface-100 dark:bg-surface-700 flex items-center justify-center mx-auto mb-3">
                <TrendingUp size={24} className="text-surface-400 dark:text-surface-500" />
              </div>
              <p className="text-sm font-medium text-surface-600 dark:text-surface-300">No new matches since yesterday</p>
              <p className="text-xs text-surface-400 dark:text-surface-400 mt-1">Post jobs and run matching to see candidates here</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-100 dark:divide-surface-700">
              {newMatches.map((m: any) => (
                <Link
                  key={m.id}
                  href={`/dashboard/recruiter/candidates/${m.candidate_id}`}
                  className="flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-3.5 hover:bg-surface-50/80 dark:hover:bg-surface-700/50 transition-colors group"
                >
                  <span className={cn('shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold', scoreColor(m.fit_score))}>
                    {m.fit_score}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{m.job?.title}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{m.job?.company} · {m.candidate?.full_name}</p>
                  </div>
                  <ChevronRight size={16} className="text-surface-300 dark:text-surface-500 group-hover:text-brand-500 dark:group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden shadow-sm">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-100 dark:border-surface-700 flex items-center justify-between bg-surface-50/50 dark:bg-surface-700/30">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Users size={18} className="text-emerald-600 dark:text-emerald-400" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display">Candidates for your jobs</h3>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{totalCandidates} matched or applied to your roles</p>
              </div>
            </div>
            <Link href="/dashboard/recruiter/candidates" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1 transition-colors">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {totalCandidates === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-surface-100 dark:bg-surface-700 flex items-center justify-center mx-auto mb-3">
                <Users size={24} className="text-surface-400 dark:text-surface-500" />
              </div>
              <p className="text-sm font-medium text-surface-600 dark:text-surface-300">No candidates yet</p>
              <p className="text-xs text-surface-400 dark:text-surface-400 mt-1">Post jobs and run matching to see candidates here</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-100 dark:divide-surface-700">
              {candList.map((c: any) => (
                <Link
                  key={c.id}
                  href={`/dashboard/recruiter/candidates/${c.id}`}
                  className="flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-3.5 hover:bg-surface-50/80 dark:hover:bg-surface-700/50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 dark:bg-brand-500/20 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-sm shrink-0">
                    {c.full_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{c.full_name}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{c.primary_title}</p>
                  </div>
                  {c.rating > 0 && (
                    <div className="flex gap-0.5 shrink-0">
                      {Array.from({ length: c.rating }).map((_: any, i: number) => (
                        <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                  )}
                  <ChevronRight size={16} className="text-surface-300 dark:text-surface-500 group-hover:text-brand-500 dark:group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              ))}
              {totalCandidates > 6 && (
                <Link href="/dashboard/recruiter/candidates" className="flex items-center justify-center gap-1.5 px-5 py-3 text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-surface-50/80 dark:hover:bg-surface-700/50 transition-colors">
                  +{totalCandidates - 6} more <ChevronRight size={14} />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
