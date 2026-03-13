'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import { PLANS, type FeatureKey, subscriptionTierToPlanKey } from '@/lib/plans';
import { UPGRADE_COPY } from '@/lib/upgradeContent';
import { useProfile } from '@/hooks';

function getFeatureFromParam(raw: string | null): FeatureKey | null {
  if (!raw) return null;
  return (Object.keys(UPGRADE_COPY) as FeatureKey[]).includes(raw as FeatureKey)
    ? (raw as FeatureKey)
    : null;
}

export default function UpgradePage() {
  const searchParams = useSearchParams();
  const featureParam = searchParams.get('feature');
  const feature = getFeatureFromParam(featureParam);
  const { profile } = useProfile();

  const currentTier = (profile as any)?.subscription_tier as 'free' | 'pro' | 'pro_plus' | 'enterprise' | null | undefined;
  const currentPlanKey = subscriptionTierToPlanKey(currentTier);

  const meta = feature ? UPGRADE_COPY[feature] : null;
  const targetPlanKey = meta?.minPlan ?? 'PRO_PLUS';
  const targetPlan = PLANS[targetPlanKey];

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-surface-800 bg-surface-900/90 shadow-xl p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/dashboard/candidate"
            className="inline-flex items-center gap-1 text-xs text-surface-400 hover:text-surface-200"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to dashboard
          </Link>
          <span className="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300">
            Most choose Pro Plus
          </span>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-xl bg-surface-800 flex items-center justify-center">
            <Lock className="h-4 w-4 text-brand-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-surface-500">Upgrade required</p>
            <h1 className="text-lg sm:text-xl font-semibold text-surface-50">
              {meta?.headline ?? 'Unlock premium CandidateMatch features'}
            </h1>
          </div>
        </div>

        <p className="text-sm text-surface-400 mb-4">
          {meta?.description ??
            'Upgrade your plan to unlock automation, deep ATS insights, and priority recruiter visibility.'}
        </p>

        <div className="rounded-xl border border-surface-700 bg-surface-900/80 p-4 mb-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-surface-400">
            <span>Current plan</span>
            <span className="font-semibold text-surface-200">{PLANS[currentPlanKey].name}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-surface-400">
            <span>Recommended upgrade</span>
            <span className="font-semibold text-brand-300">
              {targetPlan.name} · ${targetPlan.price}/mo
            </span>
          </div>
          {targetPlanKey === 'PRO_PLUS' && (
            <p className="text-[11px] text-brand-300 mt-1">
              2× features vs Pro for $15 more — most users choose Pro Plus.
            </p>
          )}
        </div>

        <div className="space-y-2 mb-4">
          <Link
            href="/pricing"
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-brand-400 hover:bg-brand-300 text-[#0a0f00] text-sm font-semibold py-2.5 transition-colors"
          >
            Upgrade to {targetPlan.name}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/pricing"
            className="block text-center text-xs text-surface-400 hover:text-surface-200"
          >
            Compare all plans on pricing page
          </Link>
        </div>

        <button
          type="button"
          onClick={() => history.back()}
          className="w-full text-center text-[11px] text-surface-500 hover:text-surface-300"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

