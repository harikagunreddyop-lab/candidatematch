'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { Star, MapPin, DollarSign, Briefcase, ChevronLeft } from 'lucide-react';

export default function CandidateMatchesPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [minScore, setMinScore] = useState(50);
  const supabase = createClient();

  useEffect(() => {
    loadMatches();
  }, [minScore]);

  async function loadMatches() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const { data: candidate } = await supabase
      .from('candidates')
      .select('id')
      .eq('user_id', session.user.id)
      .single();

    if (!candidate) {
      setMatches([]);
      setLoading(false);
      return;
    }

    const { data: matchesData } = await supabase
      .from('candidate_job_matches')
      .select(`
        id, fit_score, matched_at, job_id,
        job:jobs(
          id, title, company, location,
          salary_min, salary_max, remote_type,
          is_active
        )
      `)
      .eq('candidate_id', candidate.id)
      .gte('fit_score', minScore)
      .order('fit_score', { ascending: false });

    const list = (matchesData || []).filter((m: any) => {
      const job = Array.isArray(m.job) ? m.job[0] : m.job;
      return job && job.is_active !== false;
    });
    setMatches(list);
    setLoading(false);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/dashboard/candidate" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm mb-6">
        <ChevronLeft size={18} /> Dashboard
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Job Matches</h1>
          <p className="text-surface-400 mt-1">{matches.length} jobs matched for you</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-surface-400">Min score:</label>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
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
          <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" />
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-2xl border border-surface-700/60 bg-surface-800/50 p-12 text-center">
          <Star className="w-12 h-12 text-surface-500 mx-auto mb-4" />
          <p className="text-surface-400">No matches yet at {minScore}% or above.</p>
          <p className="text-surface-500 text-sm mt-1">Complete your profile and resume to get better matches.</p>
          <Link href="/dashboard/candidate/profile" className="inline-block mt-4 text-violet-400 hover:text-violet-300 font-medium">Edit profile →</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match: any) => {
            const job = Array.isArray(match.job) ? match.job[0] : match.job;
            if (!job) return null;
            return (
              <div key={match.id} className="bg-surface-800/50 border border-surface-700/60 rounded-xl p-6 hover:border-violet-500/50 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <Link
                      href={`/dashboard/candidate/jobs/${job.id}`}
                      className="text-xl font-semibold text-white hover:text-violet-400 transition-colors"
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
                  className="inline-block px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold transition-colors"
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
