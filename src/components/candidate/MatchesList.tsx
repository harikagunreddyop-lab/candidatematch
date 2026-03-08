'use client';

import Link from 'next/link';
import { Sparkles, MapPin, Briefcase } from 'lucide-react';
import { formatRelative } from '@/utils/helpers';
import type { CandidateJobMatch } from '@/types';

export function MatchesList({ matches }: { matches: CandidateJobMatch[] }) {
  if (matches.length === 0) {
    return (
      <div className="bg-surface-800 rounded-xl p-8 text-center border border-surface-700/60">
        <Sparkles className="w-12 h-12 text-surface-600 mx-auto mb-3" />
        <p className="text-surface-400">No matches yet. Update your profile to get AI-powered matches!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <MatchCard key={match.id} match={match} />
      ))}
    </div>
  );
}

function MatchCard({ match }: { match: CandidateJobMatch }) {
  const job = match.job;
  const postedAt = job?.scraped_at ?? job?.created_at;

  return (
    <Link href="/dashboard/candidate/matches">
      <div className="bg-surface-800 rounded-xl p-5 border border-surface-700/60 hover:border-violet-500/50 transition-all group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white group-hover:text-violet-400 transition-colors">
              {job?.title}
            </h3>
            <p className="text-surface-400 text-sm">{job?.company}</p>
          </div>
          <div className="px-3 py-1 bg-violet-500/10 text-violet-400 rounded-full text-xs font-semibold">
            {match.fit_score ?? 0}% Match
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-surface-500 flex-wrap">
          {job?.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {job.location}
            </span>
          )}
          {postedAt && (
            <span className="flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              {formatRelative(postedAt)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
