'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { Building2, Plus, ChevronRight, Users, TrendingUp } from 'lucide-react';
import { cn } from '@/utils/helpers';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('companies')
        .select('*, owner:profiles!owner_id(name, email)')
        .order('created_at', { ascending: false });
      setCompanies(data || []);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" /></div>;

  const statusColor = (s: string) => s === 'active' || s === 'trialing'
    ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Companies</h1>
          <p className="text-surface-400 text-sm">{companies.length} tenants on the platform</p>
        </div>
        <Link href="/dashboard/admin/companies/new"
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" />New Company
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Companies',  value: companies.length,                                                   icon: Building2 },
          { label: 'Active',           value: companies.filter((c: any) => c.subscription_status === 'active').length,    icon: TrendingUp },
          { label: 'Trialing',         value: companies.filter((c: any) => c.subscription_status === 'trialing').length,  icon: Users },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-surface-800 border border-surface-700/60 p-5">
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-surface-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Company list */}
      <div className="rounded-2xl bg-surface-800 border border-surface-700/60 overflow-hidden">
        {companies.length === 0 && (
          <div className="p-8 text-center text-surface-500">
            No companies yet. <Link href="/dashboard/admin/companies/new" className="text-violet-400 hover:underline">Create the first one →</Link>
          </div>
        )}
        {companies.map((co: any, i: number) => (
          <div key={co.id} className={cn('p-4 hover:bg-surface-700/30 transition-colors', i > 0 && 'border-t border-surface-700/40')}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {co.logo_url
                  ? <img src={co.logo_url} alt={co.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  : <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5 text-violet-400" /></div>
                }
                <div className="min-w-0">
                  <div className="font-semibold text-white">{co.name}</div>
                  <div className="text-xs text-surface-500 truncate">{(co.owner as any)?.email || 'No owner'} · {co.subscription_plan}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusColor(co.subscription_status))}>
                  {co.subscription_status}
                </span>
                <Link href={`/dashboard/admin/companies/${co.id}`} className="text-surface-400 hover:text-white transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
