'use client';
// Candidates are invite-only; no onboarding. Redirect to waiting.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CandidateOnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/candidate/waiting');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-surface-500">Redirecting...</p>
    </div>
  );
}
