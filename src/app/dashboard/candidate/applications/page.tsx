'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CandidateApplicationsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/candidate?tab=applications');
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-surface-500">Redirecting to applications…</p>
    </div>
  );
}
