'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CandidateMatchesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/candidate?tab=matches');
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-surface-500">Redirecting to matches…</p>
    </div>
  );
}
