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
  const matchedAt = match.matched_at ? new Date(match.matched_at) : null;
  const isNew = matchedAt ? Date.now() - matchedAt.getTime() < 24 * 60 * 60 * 1000 : false;

  return (
    <Link href="/dashboard/candidate/matches">
      <div className="bg-surface-800 rounded-xl p-5 border border-surface-700/60 hover:border-brand-400/50 transition-all group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white group-hover:text-brand-400 transition-colors">
              {job?.title}
            </h3>
            <p className="text-surface-400 text-sm">{job?.company}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="px-3 py-1 bg-brand-400/10 text-brand-400 rounded-full text-xs font-semibold">
              {match.fit_score ?? 0}% Match
            </div>
            {isNew && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold uppercase tracking-wide">
                New
              </span>
            )}
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
