'use client';

import { useState } from 'react';
import Link from 'next/link';

type PlanKey = 'free' | 'pro' | 'pro_plus';

type PricingCardProps = {
  name: string;
  price: number;
  features: string[];
  cta: string;
  popular: boolean;
  planKey: PlanKey;
};

export function PricingCard({ name, price, features, cta, popular, planKey }: PricingCardProps) {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    if (planKey === 'free') return;
    setLoading(true);
    try {
      const res = await fetch('/api/billing/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planName: planKey }),
      });
      const data = await res.json();
      if (res.status === 401) {
        window.location.href = '/auth?next=/pricing';
        return;
      }
      if (!res.ok) {
        alert(data.error || 'Something went wrong');
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      alert('Something went wrong. Try signing in first.');
    } finally {
      setLoading(false);
    }
  }

  const isProPlus = planKey === 'pro_plus';
  const isFree = planKey === 'free';

  return (
    <div
      className={`rounded-2xl p-8 transition-all ${
        popular
          ? 'bg-gradient-to-b from-brand-600/10 to-brand-500/10 border-2 border-brand-400/30 shadow-xl shadow-blue-600/5'
          : 'bg-surface-100/50 border border-surface-300'
      }`}
    >
      {popular && (
        <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Most Popular</div>
      )}
      <h3 className="text-2xl font-bold text-white">{name}</h3>
      <div className="mt-2 mb-4">
        <span className="text-4xl font-bold text-white">
          {price === 0 ? '$0' : `$${price}`}
        </span>
        <span className="text-neutral-500 text-sm">/month</span>
      </div>
      <div className="mt-6">
        {isFree ? (
          <Link
            href="/auth"
            className="block text-center py-3 rounded-xl font-medium bg-surface-100/50 hover:bg-surface-200/50 text-neutral-300 transition"
          >
            {cta}
          </Link>
        ) : isProPlus ? (
          <a
            href="mailto:sales@candidatematch.io?subject=Pro Plus plan"
            className="block text-center py-3 rounded-xl font-medium bg-brand-400 hover:bg-brand-300 text-[#0a0f00] transition"
          >
            {cta}
          </a>
        ) : (
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full text-center py-3 rounded-xl font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60 transition"
          >
            {loading ? 'Loading…' : cta}
          </button>
        )}
      </div>
      <ul className="mt-6 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-neutral-400">
            <span className="text-blue-400 mt-0.5 shrink-0">✓</span> {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
