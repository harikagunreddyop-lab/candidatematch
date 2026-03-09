'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Star, MapPin, DollarSign, Briefcase, ChevronLeft } from 'lucide-react';

export default function CandidateMatchesPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [allApiMatches, setAllApiMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [minScore, setMinScore] = useState(50);
  const [limitReached, setLimitReached] = useState(false);
  const [usedThisWeek, setUsedThisWeek] = useState(0);
  const [weeklyLimit, setWeeklyLimit] = useState<number | null>(null);
  const [hasResume, setHasResume] = useState<boolean | null>(null);
  const [hasCandidateProfile, setHasCandidateProfile] = useState<boolean | null>(null);

  useEffect(() => {
    (async function loadMatches() {
      setLoading(true);
      try {
        const [matchesRes, resumeRes] = await Promise.all([
          fetch('/api/candidate/matches', { credentials: 'include' }),
          fetch('/api/candidate/resume', { credentials: 'include' }),
        ]);
        const data = await matchesRes.json().catch(() => ({}));
        const resumeData = await resumeRes.json().catch(() => ({}));
        const apiMatches = Array.isArray(data.matches) ? data.matches : [];
        const activeOnly = apiMatches.filter((m: any) => {
          const job = Array.isArray(m.job) ? m.job[0] : m.job;
          return !job || job.is_active !== false;
        });
        setAllApiMatches(activeOnly);
        setLimitReached(Boolean(data?.limitReached));
        setUsedThisWeek(typeof data?.usedThisWeek === 'number' ? data.usedThisWeek : activeOnly.length);
        setWeeklyLimit(typeof data?.limit === 'number' && data.limit >= 0 ? data.limit : null);
        setHasCandidateProfile(resumeRes.status !== 404);
        setHasResume(Array.isArray(resumeData?.resumes) ? resumeData.resumes.length > 0 : false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const filtered = allApiMatches.filter((m: any) => (m.fit_score ?? 0) >= minScore);
    setMatches(filtered);
  }, [allApiMatches, minScore]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/dashboard/candidate" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm mb-6">
        <ChevronLeft size={18} /> Dashboard
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Job Matches</h1>
          <p className="text-surface-400 mt-1">
            {matches.length} matches at {minScore}%+ ({usedThisWeek} available this week)
          </p>
          {limitReached && weeklyLimit != null && (
            <p className="text-xs text-amber-300 mt-1">
              Weekly free limit reached ({weeklyLimit}). Upgrade to Pro for unlimited matches.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-surface-400">Min score:</label>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-[#0a0a0a] font-bold"
          >
            <option value={50}>50%+</option>
            <option value={70}>70%+</option>
            <option value={80}>80%+</option>
            <option value={90}>90%+</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full" />
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-2xl border border-surface-700/60 bg-surface-800/50 p-12 text-center">
          <Star className="w-12 h-12 text-surface-500 mx-auto mb-4" />
          {limitReached ? (
            <>
              <p className="text-surface-300">You reached your weekly match limit.</p>
              <p className="text-surface-500 text-sm mt-1">
                {weeklyLimit != null ? `You have used ${weeklyLimit}/${weeklyLimit} matches this week.` : 'Upgrade to Pro for unlimited matches.'}
              </p>
            </>
          ) : allApiMatches.length > 0 ? (
            <>
              <p className="text-surface-300">No matches at {minScore}% or above.</p>
              <p className="text-surface-500 text-sm mt-1">Lower the minimum score to see more opportunities.</p>
            </>
          ) : hasCandidateProfile === false ? (
            <>
              <p className="text-surface-300">No candidate profile found.</p>
              <p className="text-surface-500 text-sm mt-1">Complete onboarding so we can generate role-based matches.</p>
            </>
          ) : hasResume === false ? (
            <>
              <p className="text-surface-300">No resume on file yet.</p>
              <p className="text-surface-500 text-sm mt-1">Upload a resume to improve scoring and unlock better matches.</p>
            </>
          ) : (
            <>
              <p className="text-surface-300">No active matches available right now.</p>
              <p className="text-surface-500 text-sm mt-1">We&apos;ll show new matches as soon as fresh jobs are scored.</p>
            </>
          )}
          <div className="mt-4 flex items-center justify-center gap-4">
            <Link href="/dashboard/candidate/profile" className="text-brand-400 hover:text-brand-300 font-medium">Edit profile →</Link>
            <Link href="/dashboard/candidate/profile/resume" className="text-brand-400 hover:text-brand-300 font-medium">Upload resume →</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match: any) => {
            const job = Array.isArray(match.job) ? match.job[0] : match.job;
            if (!job) return null;
            return (
              <div key={match.id} className="bg-surface-800/50 border border-surface-700/60 rounded-xl p-6 hover:border-brand-400/50 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <Link
                      href={`/dashboard/candidate/jobs/${job.id}`}
                      className="text-xl font-semibold text-white hover:text-brand-400 transition-colors"
                    >
                      {job.title}
                    </Link>
                    <div className="text-surface-400 mt-1">{job.company}</div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                    <Star className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-400">{match.fit_score}% Match</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-surface-400 mb-4 flex-wrap">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {job.location || 'Remote'}
                  </div>
                  {job.salary_min != null && (
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      ${Number(job.salary_min).toLocaleString()}
                      {job.salary_max != null && ` – $${Number(job.salary_max).toLocaleString()}`}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Briefcase className="w-4 h-4" />
                    {job.remote_type || 'On-site'}
                  </div>
                </div>

                <Link
                  href={`/dashboard/candidate/jobs/${job.id}`}
                  className="inline-block px-4 py-2 bg-brand-400 hover:bg-brand-300 text-[#0a0f00] rounded-lg font-semibold transition-colors"
                >
                  View & Apply
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
