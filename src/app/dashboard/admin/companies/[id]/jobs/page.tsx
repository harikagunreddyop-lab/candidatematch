'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Briefcase } from 'lucide-react';
import { formatRelative } from '@/utils/helpers';

export default function AdminCompanyJobsPage() {
  const params = useParams();
  const companyId = params?.id as string;
  const supabase = createClient();
  const [company, setCompany] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const [companyRes, jobsRes] = await Promise.all([
        supabase.from('companies').select('name').eq('id', companyId).single(),
        supabase.from('jobs').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      ]);
      setCompany(companyRes.data);
      setJobs(jobsRes.data || []);
      setLoading(false);
    })();
  }, [companyId, supabase]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" /></div>;
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link href={`/dashboard/admin/companies/${companyId}`} className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
        <ChevronLeft size={18} /> Back to company
      </Link>
      <h1 className="text-2xl font-bold text-white">{company?.name} — Jobs</h1>
      <div className="rounded-2xl border border-surface-700 bg-surface-800/50 overflow-hidden">
        {jobs.length === 0 ? <div className="p-8 text-center text-surface-500">No jobs.</div> : (
          <ul className="divide-y divide-surface-700/50">
            {jobs.map((j: any) => (
              <li key={j.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">{j.title}</div>
                  <div className="text-xs text-surface-500">{j.company} · {formatRelative(j.scraped_at || j.created_at)}</div>
                </div>
                <span className={j.is_active ? 'text-emerald-400 text-sm font-medium' : 'text-surface-500 text-sm'}>{j.is_active ? 'Active' : 'Closed'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
