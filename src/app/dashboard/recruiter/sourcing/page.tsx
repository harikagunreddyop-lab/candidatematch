'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Users, Sparkles } from 'lucide-react';

export default function SourcingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters] = useState({ location: '', experience: '', skills: [] as string[] });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-6">Candidate Sourcing</h1>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
          <input
            type="text"
            placeholder="Search by skills, title, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-surface-100 border border-surface-700 rounded-lg text-white placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
          />
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="bg-brand-400/10 border-brand-400/20 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-5 h-5 text-brand-400" />
          <h2 className="text-lg font-semibold text-white">AI Recommendations</h2>
        </div>
        <p className="text-surface-400 mb-4">
          Based on your open positions, we recommend these candidates
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/dashboard/recruiter/candidates"
            className="rounded-lg border border-surface-700 bg-surface-100 p-4 hover:border-brand-400/30 transition-colors"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-surface-700 flex items-center justify-center">
                <Users className="w-5 h-5 text-surface-400" />
              </div>
              <span className="font-medium text-white">View matched candidates</span>
            </div>
            <p className="text-sm text-surface-500">See AI-matched candidates for your company jobs</p>
          </Link>
        </div>
      </div>

      {/* Search Results */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Search Results</h3>
        {!searchQuery && !filters.location && filters.skills.length === 0 ? (
          <div className="rounded-xl border border-surface-700 bg-surface-100 py-12 text-center text-surface-500">
            Enter a search or use filters to find candidates
          </div>
        ) : (
          <div className="rounded-xl border border-surface-700 bg-surface-100 py-12 text-center text-surface-500">
            No results yet. Try adjusting your search or check back after posting jobs.
          </div>
        )}
      </div>
    </div>
  );
}
