import type { FeatureKey, PlanKey } from '@/lib/plans';

type UpgradeCopy = {
  headline: string;
  description: string;
  minPlan: PlanKey;
};

export const UPGRADE_COPY: Record<FeatureKey, UpgradeCopy> = {
  resumeDownload: {
    headline: 'Download your resume anytime',
    description: 'Export polished PDF versions recruiters can open on any device.',
    minPlan: 'PRO',
  },
  atsBreakdown: {
    headline: 'See every keyword you\'re missing',
    description: 'Unlock full ATS breakdowns so you know exactly how to improve.',
    minPlan: 'PRO',
  },
  bulkApply: {
    headline: 'Apply to 80 jobs with one click',
    description: 'Batch-apply to curated roles so you can focus on interviews, not forms.',
    minPlan: 'PRO_PLUS',
  },
  autoApply: {
    headline: 'Let the platform apply while you sleep',
    description: 'Turn on auto-apply for matching roles and wake up to new applications.',
    minPlan: 'PRO_PLUS',
  },
  resumeCoaching: {
    headline: 'Get AI coaching on every resume version',
    description: 'Line-by-line feedback on structure, keywords, and clarity.',
    minPlan: 'PRO_PLUS',
  },
  interviewScore: {
    headline: 'Know your odds before you apply',
    description: 'See a probability-style score that predicts how likely you are to advance.',
    minPlan: 'PRO_PLUS',
  },
  dedicatedAdvisor: {
    headline: 'A human advisor in your corner',
    description: 'Work 1:1 with a career expert to plan, prioritize, and negotiate offers.',
    minPlan: 'ELITE',
  },
  recruiterVisibility: {
    headline: 'Stand out in recruiter searches',
    description: 'Get surfaced higher when recruiters search the candidate pool.',
    minPlan: 'PRO',
  },
  profileViewers: {
    headline: 'See who’s checking your profile',
    description: 'Get insight into which companies are looking at you and when.',
    minPlan: 'PRO',
  },
  applicationAnalytics: {
    headline: 'Understand which applications are working',
    description: 'Response, interview, and offer rates broken down by role and company.',
    minPlan: 'PRO',
  },
  resumeTailoring: {
    headline: 'Tailor your resume to every job',
    description: 'Generate a targeted version of your resume for each application.',
    minPlan: 'PRO',
  },
} as const;

