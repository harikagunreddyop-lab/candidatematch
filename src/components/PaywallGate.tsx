'use client';

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { canAccess, PLANS, type FeatureKey, type PlanKey } from '@/lib/plans';
import Link from 'next/link';

const FEATURE_LABELS: Record<FeatureKey, { label: string; description: string; minPlan: PlanKey }> = {
  resumeDownload: {
    label: 'Resume download',
    description: 'Export polished, recruiter-ready versions of your resume anytime.',
    minPlan: 'PRO',
  },
  atsBreakdown: {
    label: 'ATS breakdown',
    description: 'See exactly which keywords you match or miss before you apply.',
    minPlan: 'PRO',
  },
  resumeTailoring: {
    label: 'Resume tailoring',
    description: 'Instantly tailor your resume to each job description.',
    minPlan: 'PRO',
  },
  recruiterVisibility: {
    label: 'Recruiter visibility',
    description: 'Get surfaced higher in recruiter searches and shortlists.',
    minPlan: 'PRO',
  },
  profileViewers: {
    label: 'Profile viewer insights',
    description: 'See who viewed your profile and when they looked.',
    minPlan: 'PRO',
  },
  bulkApply: {
    label: 'Bulk apply',
    description: 'Apply to dozens of curated roles in a single session.',
    minPlan: 'PRO_PLUS',
  },
  autoApply: {
    label: 'Auto-apply',
    description: 'Let CandidateMatch apply for you while you focus on interviews.',
    minPlan: 'PRO_PLUS',
  },
  applicationAnalytics: {
    label: 'Application analytics',
    description: 'Understand your response and interview rates by role and company.',
    minPlan: 'PRO',
  },
  resumeCoaching: {
    label: 'Resume coaching',
    description: 'Get AI-powered suggestions on every resume version you create.',
    minPlan: 'PRO_PLUS',
  },
  interviewScore: {
    label: 'Interview score',
    description: 'Estimate your chances before you invest time into an application.',
    minPlan: 'PRO_PLUS',
  },
  dedicatedAdvisor: {
    label: 'Dedicated advisor',
    description: 'Work 1:1 with a human advisor to steer your entire search.',
    minPlan: 'ELITE',
  },
};

type PaywallGateProps = {
  feature: FeatureKey;
  userPlan: PlanKey;
  children: ReactNode;
};

export function PaywallGate({ feature, userPlan, children }: PaywallGateProps) {
  if (canAccess(userPlan, feature)) {
    return <>{children}</>;
  }

  const meta = FEATURE_LABELS[feature];
  const targetPlan = meta.minPlan;
  const target = PLANS[targetPlan];

  return (
    <div className="relative">
      <div className="pointer-events-none opacity-40 grayscale">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-2xl bg-surface-900/90 border border-surface-700 px-5 py-4 max-w-sm text-center shadow-xl">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface-800">
            <Lock className="h-4 w-4 text-brand-400" />
          </div>
          <h3 className="text-sm font-semibold text-surface-50 mb-1">
            Unlock {meta.label}
          </h3>
          <p className="text-xs text-surface-400 mb-3">{meta.description}</p>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-lg bg-brand-400 hover:bg-brand-300 text-[#0a0f00] text-xs font-semibold px-3 py-1.5"
          >
            Upgrade to {target.name} — ${target.price}/mo
          </Link>
        </div>
      </div>
    </div>
  );
}

