'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { Building2, Search, ChevronRight, Plus } from 'lucide-react';

type Filter = 'all' | 'active' | 'trialing' | 'past_due';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const supabase = createClient();

  useEffect(() => {
    loadCompanies();
  }, [filter]);

  async function loadCompanies() {
    setLoading(true);
    let query = supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('subscription_status', filter);
    }

    const { data } = await query;
    setCompanies(data || []);
    setLoading(false);
  }

  const filteredCompanies = companies.filter(
    (c) =>
      search === '' ||
      (c.name && c.name.toLowerCase().includes(search.toLowerCase())) ||
      (c.slug && c.slug.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Companies</h1>
          <p className="text-surface-400 mt-1">{companies.length} total companies</p>
        </div>
        <Link
          href="/dashboard/admin/companies/new"
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Company
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-500 focus:outline-none focus:border-violet-500"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
        >
          <option value="all">All Companies</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past Due</option>
        </select>
      </div>

      <div className="bg-surface-800/50 border border-surface-700/60 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-900/50 border-b border-surface-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Company</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase">MRR</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Created</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700/50">
              {filteredCompanies.map((company) => (
                <tr key={company.id} className="hover:bg-surface-900/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-surface-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">{company.name}</div>
                        <div className="text-xs text-surface-500 truncate">{company.slug || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-violet-500/10 text-violet-400 text-xs font-medium rounded">
                      {company.subscription_plan}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={company.subscription_status} />
                  </td>
                  <td className="px-6 py-4 text-white font-medium">
                    ${getMRR(company.subscription_plan)}
                  </td>
                  <td className="px-6 py-4 text-surface-400 text-sm">
                    {company.created_at ? new Date(company.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/admin/companies/${company.id}`}
                      className="inline-flex text-violet-400 hover:text-violet-300 transition-colors"
                      aria-label="View company"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filteredCompanies.length === 0 && (
          <div className="px-6 py-12 text-center text-surface-500">
            {companies.length === 0 ? (
              <>
                No companies yet.{' '}
                <Link href="/dashboard/admin/companies/new" className="text-violet-400 hover:underline">
                  Create the first one →
                </Link>
              </>
            ) : (
              'No companies match your search.'
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400',
    trialing: 'bg-blue-500/10 text-blue-400',
    past_due: 'bg-red-500/10 text-red-400',
    canceled: 'bg-surface-500/10 text-surface-400',
    paused: 'bg-amber-500/10 text-amber-400',
  };
  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded ${colors[status] || colors.canceled}`}
    >
      {status}
    </span>
  );
}

function getMRR(plan: string): number {
  const pricing: Record<string, number> = {
    starter: 299,
    growth: 599,
    enterprise: 2499,
    unlimited: 4999,
  };
  return pricing[plan] ?? 0;
}
