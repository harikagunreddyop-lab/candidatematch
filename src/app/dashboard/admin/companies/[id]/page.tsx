'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Building2, Users, Briefcase, ClipboardList, ChevronLeft } from 'lucide-react';
import { cn } from '@/utils/helpers';

export default function AdminCompanyDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const supabase = createClient();
  const [company, setCompany] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [jobsCount, setJobsCount] = useState(0);
  const [applicationsCount, setApplicationsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [companyRes, teamRes, jobsRes] = await Promise.all([
        supabase.from('companies').select('*').eq('id', id).single(),
        supabase.from('profiles').select('id, name, email, effective_role').eq('company_id', id),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', id),
      ]);
      setCompany(companyRes.data);
      setTeam(teamRes.data || []);

      const jobIds = (await supabase.from('jobs').select('id').eq('company_id', id)).data?.map((j: any) => j.id) || [];
      if (jobIds.length > 0) {
        const { count } = await supabase.from('applications').select('id', { count: 'exact', head: true }).in('job_id', jobIds);
        setApplicationsCount(count ?? 0);
      }
      setJobsCount(jobsRes.count ?? 0);
      setLoading(false);
    })();
  }, [id, supabase]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" /></div>;
  if (!company) return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-surface-500">Company not found.</div>;

  const statusColor = (s: string) => s === 'active' || s === 'trialing' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/admin/companies" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
          <ChevronLeft size={18} /> Companies
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          {company.logo_url ? (
            <Image src={company.logo_url} alt={company.name} width={48} height={48} className="w-12 h-12 rounded-xl object-cover" unoptimized />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-brand-400/15 flex items-center justify-center"><Building2 className="w-6 h-6 text-brand-400" /></div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">{company.name}</h1>
            <p className="text-surface-500 text-sm capitalize">{company.subscription_plan} · <span className={cn('font-medium', statusColor(company.subscription_status))}>{company.subscription_status}</span></p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Link href={`/dashboard/admin/companies/${id}/jobs`} className="rounded-2xl border border-surface-700 bg-surface-800/50 p-5 hover:bg-surface-700/50 transition-colors">
          <Briefcase className="w-8 h-8 text-brand-400 mb-2" />
          <div className="text-2xl font-bold text-white">{jobsCount}</div>
          <div className="text-xs text-surface-500">Jobs</div>
        </Link>
        <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-5">
          <ClipboardList className="w-8 h-8 text-amber-400 mb-2" />
          <div className="text-2xl font-bold text-white">{applicationsCount}</div>
          <div className="text-xs text-surface-500">Applications</div>
        </div>
        <Link href={`/dashboard/admin/companies/${id}/team`} className="rounded-2xl border border-surface-700 bg-surface-800/50 p-5 hover:bg-surface-700/50 transition-colors">
          <Users className="w-8 h-8 text-cyan-400 mb-2" />
          <div className="text-2xl font-bold text-white">{team.length}</div>
          <div className="text-xs text-surface-500">Team</div>
        </Link>
      </div>

      <div className="rounded-2xl border border-surface-700 bg-surface-800/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-700 font-semibold text-white">Team</div>
        <div className="divide-y divide-surface-700/50">
          {team.length === 0 ? (
            <div className="p-8 text-center text-surface-500">No team members.</div>
          ) : (
            team.map((m: any) => (
              <div key={m.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-400/20 flex items-center justify-center text-brand-400 font-semibold text-sm">
                    {(m.name || m.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-white">{m.name || m.email}</div>
                    <div className="text-xs text-surface-500">{m.email} · {m.effective_role?.replace('_', ' ')}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Link href={`/dashboard/admin/companies/${id}/team`} className="px-4 py-2 bg-brand-400 hover:bg-brand-300 text-white rounded-xl text-sm font-semibold">
          Manage team
        </Link>
        <Link href={`/dashboard/admin/companies/${id}/jobs`} className="px-4 py-2 bg-surface-700 hover:bg-surface-600 text-white rounded-xl text-sm font-semibold">
          View jobs
        </Link>
      </div>
    </div>
  );
}
