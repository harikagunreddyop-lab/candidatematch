'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Briefcase, ChevronLeft, Users } from 'lucide-react';
import { formatRelative } from '@/utils/helpers';
import { Spinner } from '@/components/ui';

export default function RecruiterJobDetailPage() {
  const params = useParams();
  const jobId = params?.id as string;
  const supabase = createClient();
  const [job, setJob] = useState<any>(null);
  const [applicationsCount, setApplicationsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: jobData } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('posted_by', session.user.id)
        .single();
      if (!jobData) { setLoading(false); return; }

      setJob(jobData);
      const { count } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId);
      setApplicationsCount(count ?? 0);
      setLoading(false);
    })();
  }, [jobId, supabase]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (!job) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center text-surface-500">
      Job not found or you don’t have access. You can only view jobs you posted.
      <Link href="/dashboard/recruiter/jobs" className="block mt-2 text-violet-400 hover:underline">Back to my jobs</Link>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link href="/dashboard/recruiter/jobs" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
        <ChevronLeft size={18} /> My jobs
      </Link>

      <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-6">
        <h1 className="text-2xl font-bold text-white">{job.title}</h1>
        <p className="text-surface-500 mt-1">{job.company} · {formatRelative(job.scraped_at || job.created_at)}</p>
        <div className="flex items-center gap-4 mt-4">
          <span className={job.is_active ? 'text-emerald-400 text-sm font-medium' : 'text-surface-500 text-sm'}>{job.is_active ? 'Active' : 'Closed'}</span>
          <span className="text-surface-400 text-sm">{job.location || '—'}</span>
        </div>
        {job.jd_clean && <div className="mt-6 text-surface-300 text-sm whitespace-pre-wrap">{job.jd_clean}</div>}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Candidates</h2>
        <span className="text-surface-500 text-sm">{job.applications_count ?? applicationsCount} applications</span>
      </div>
      <Link href={`/dashboard/recruiter/jobs/${jobId}/candidates`} className="flex items-center gap-3 p-4 rounded-xl border border-surface-700 bg-surface-800/50 hover:bg-surface-700/50 transition-colors">
        <Users className="w-8 h-8 text-violet-400" />
        <span className="font-medium text-white">View candidates for this job</span>
        <ChevronLeft size={18} className="ml-auto rotate-180 text-surface-500" />
      </Link>
    </div>
  );
}
