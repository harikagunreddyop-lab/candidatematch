'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { AIJobDescriptionGenerator, InclusiveLanguageChecker } from '@/components/company/jobs';

export default function CompanyJobEditPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id as string;
  const supabase = createClient();
  const [job, setJob] = useState<any>(null);
  const [_companyId, setCompanyId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: profile } = await supabase.from('profile_roles').select('company_id').eq('id', session.user.id).single();
      if (!profile?.company_id) { setLoading(false); return; }
      const { data: jobData } = await supabase.from('jobs').select('*').eq('id', jobId).eq('company_id', profile.company_id).single();
      if (!jobData) { setLoading(false); return; }
      setJob(jobData);
      setCompanyId(profile.company_id);
      setTitle(jobData.title || '');
      setCompanyName(jobData.company || '');
      setLocation(jobData.location || '');
      setDescription(jobData.jd_clean || jobData.jd_raw || '');
      setLoading(false);
    })();
  }, [jobId, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSaving(true);
    const { error } = await supabase.from('jobs').update({
      title: title || job.title,
      company: companyName || job.company,
      location: location || null,
      jd_clean: description || null,
      jd_raw: description || null,
    }).eq('id', job.id);
    setSaving(false);
    if (error) return;
    router.push(`/dashboard/company/jobs/${jobId}`);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (!job) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center text-surface-500">
      Job not found. <Link href="/dashboard/company/jobs" className="text-brand-400 hover:underline">Back to jobs</Link>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link href={`/dashboard/company/jobs/${jobId}`} className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
        <ChevronLeft size={18} /> Back to job
      </Link>
      <h1 className="text-2xl font-bold text-white">Edit job</h1>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-surface-700 bg-surface-800/50 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Job title *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white" />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Company name</label>
          <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white" />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Location</label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white" />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white" />
        </div>
        <AIJobDescriptionGenerator
          initialInput={{
            job_title: title,
            department: (job as { department?: string })?.department ?? '',
            seniority_level: 'mid',
            work_location: 'hybrid',
          }}
          onGenerated={(fullText) => setDescription(fullText)}
        />
        <InclusiveLanguageChecker jobId={jobId} />
        <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-400 hover:bg-brand-300 text-[#0a0f00] disabled:opacity-50 text-white rounded-xl font-semibold">
          {saving ? <Spinner size={18} className="inline mr-2" /> : null} Save changes
        </button>
      </form>
    </div>
  );
}
