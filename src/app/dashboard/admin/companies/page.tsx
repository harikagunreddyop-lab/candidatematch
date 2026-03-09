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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCompanies keyed by filter only
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
    <div className="space-y-6">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Companies</h1>
          <p className="admin-page-subtitle">{companies.length} total companies</p>
        </div>
        <Link
          href="/dashboard/admin/companies/new"
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Company
        </Link>
      </div>

      <div className="admin-toolbar">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input text-sm w-full pl-10 pr-4 py-2.5"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="input text-sm px-4 py-2.5 w-full sm:w-52"
        >
          <option value="all">All Companies</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past Due</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-white border-b border-surface-300">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Company</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase">MRR</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Created</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {filteredCompanies.map((company) => (
                <tr key={company.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-surface-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-surface-900 truncate">{company.name}</div>
                        <div className="text-xs text-surface-500 truncate">{company.slug || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-[#EFF6FF] text-[#2563EB] text-xs font-medium rounded">
                      {company.subscription_plan}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={company.subscription_status} />
                  </td>
                  <td className="px-6 py-4 text-surface-900 font-medium">
                    ${getMRR(company.subscription_plan)}
                  </td>
                  <td className="px-6 py-4 text-surface-400 text-sm">
                    {company.created_at ? new Date(company.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/admin/companies/${company.id}`}
                      className="inline-flex text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
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
                <Link href="/dashboard/admin/companies/new" className="text-[#2563EB] hover:underline">
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
    active: 'bg-emerald-50 text-emerald-700',
    trialing: 'bg-blue-50 text-blue-700',
    past_due: 'bg-red-50 text-red-700',
    canceled: 'bg-surface-100 text-surface-500',
    paused: 'bg-amber-50 text-amber-700',
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
