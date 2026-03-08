'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { JobSearchView } from '@/components/jobs/JobSearchView';
import Link from 'next/link';
import { Briefcase } from 'lucide-react';

export default function RecruiterJobsPage() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserId(null);
        return;
      }
      const { data: profile } = await supabase
        .from('profile_roles')
        .select('company_id')
        .eq('id', user.id)
        .single();
      if (!profile?.company_id) {
        setUserId(null);
        return;
      }
      setUserId(user.id);
    })();
  }, [supabase]);

  if (userId === undefined) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (userId === null) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
        <Briefcase className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-surface-900 dark:text-surface-100">No company linked</h2>
        <p className="text-surface-500 dark:text-surface-400 mt-2 text-sm">
          Your account is not linked to a company. Ask your company admin to add you to the team to see and manage jobs.
        </p>
        <Link href="/dashboard/company" className="inline-block mt-4 text-brand-600 dark:text-brand-400 font-medium text-sm hover:underline">Go to Company dashboard</Link>
      </div>
    );
  }

  return <JobSearchView role="recruiter" postedByUserId={userId} />;
}
