'use client';

import { useState } from 'react';
import Link from 'next/link';

export function CandidateProCta() {
  const [loading, setLoading] = useState(false);

  async function handleStartPro(interval: 'monthly' | 'yearly') {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) window.location.href = '/auth?next=/pricing';
        else alert(data.error || 'Something went wrong');
        return;
      }
      if (data.url) window.location.href = data.url;
      else window.location.href = '/auth?next=/pricing';
    } catch {
      alert('Something went wrong. Try signing in first.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => handleStartPro('monthly')}
        disabled={loading}
        className="w-full text-center py-3 rounded-xl font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60 transition"
      >
        {loading ? 'Loading…' : 'Start Pro — $29/month'}
      </button>
      <button
        type="button"
        onClick={() => handleStartPro('yearly')}
        disabled={loading}
        className="w-full text-center py-2.5 rounded-xl font-medium bg-surface-100/50 hover:bg-surface-200/50 text-neutral-300 disabled:opacity-60 transition text-sm"
      >
        {loading ? '…' : 'Or $290/year (save 20%)'}
      </button>
      <p className="text-xs text-neutral-500 mt-1">
        Already have an account? <Link href="/auth" className="text-blue-400 hover:underline">Sign in</Link> to upgrade.
      </p>
    </div>
  );
}
