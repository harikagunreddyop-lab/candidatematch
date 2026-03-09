'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { JobCreationWizard } from '@/components/company/jobs';
import type { JobFormData } from '@/components/company/jobs';

export default function CompanyJobNewPage() {
  const supabase = createClient();
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase.from('profile_roles').select('company_id').eq('id', session.user.id).single();
      if (!profile?.company_id) return;
      const { data: company } = await supabase.from('companies').select('name').eq('id', profile.company_id).single();
      setCompanyName(company?.name ?? '');
    })();
  }, [supabase]);

  const handleSubmit = async (data: JobFormData) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');
    const { data: profile } = await supabase
      .from('profile_roles')
      .select('company_id')
      .eq('id', session.user.id)
      .single();
    if (!profile?.company_id) throw new Error('No company linked');

    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', profile.company_id)
      .single();

    const res = await fetch('/api/companies/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title || 'Untitled Job',
        company: data.companyName || company?.name || 'Company',
        location: data.location || undefined,
        department: data.department || undefined,
        jd_raw: data.description || undefined,
        description: data.description || undefined,
        salary_min: data.salary_min ?? undefined,
        salary_max: data.salary_max ?? undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create job');
    router.push(`/dashboard/company/jobs/${json.job?.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link
        href="/dashboard/company/jobs"
        className="text-surface-400 hover:text-white flex items-center gap-1 text-sm"
      >
        <ChevronLeft size={18} /> Jobs
      </Link>
      <h1 className="text-2xl font-bold text-white">Post a job</h1>
      <p className="text-surface-400 text-sm">
        Use the wizard to add basics, generate or paste a description, set salary, and preview before posting.
      </p>
      <JobCreationWizard
        initialCompanyName={companyName}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/dashboard/company/jobs')}
      />
    </div>
  );
}
