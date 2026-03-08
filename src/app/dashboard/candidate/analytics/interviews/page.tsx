'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InterviewAnalyticsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/candidate/interviews');
  }, [router]);
  return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" />
    </div>
  );
}
