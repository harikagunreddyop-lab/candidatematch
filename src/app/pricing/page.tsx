import type { Metadata } from 'next';
import Link from 'next/link';
import { PricingCard } from './PricingCard';
import { ComparisonTable } from './ComparisonTable';

export const metadata: Metadata = {
  title: 'Pricing — CandidateMatch',
  description: 'Simple, transparent pricing for job seekers and companies. Free for candidates; flexible plans for hiring teams.',
};

const CANDIDATE_PLANS = [
  {
    name: 'Free',
    price: 0,
    features: [
      '5 job applications per month',
      'Basic resume builder',
      'Job search access',
      'Profile creation',
    ],
    cta: 'Get Started',
    popular: false,
    planKey: 'free' as const,
  },
  {
    name: 'Pro',
    price: 29,
    features: [
      'Unlimited applications',
      'AI-powered resume generation',
      'Email tracking & auto-updates',
      'ATS scoring & optimization',
      '10 job alerts',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    popular: true,
    planKey: 'pro' as const,
  },
  {
    name: 'Pro Plus',
    price: 99,
    features: [
      'Everything in Pro',
      'Priority matching (top of recruiter lists)',
      'Advanced analytics dashboard',
      '1-on-1 career coaching (monthly)',
      'Interview preparation',
      'Unlimited job alerts',
      'White-glove support',
    ],
    cta: 'Contact Sales',
    popular: false,
    planKey: 'pro_plus' as const,
  },
];

export default function PricingPage() {
  const companyPlans = [
    {
      name: 'Starter',
      price: '$299',
      period: '/month',
      description: 'Perfect for startups (1–10 employees).',
      features: [
        '1 user seat',
        '3 active job postings',
        'AI-powered candidate matching',
        '50 candidate profiles/month',
        'Basic analytics',
        'Email support',
      ],
      successFee: '$3,999 per hire',
      cta: 'Start trial',
      href: '/auth',
      highlight: false,
    },
    {
      name: 'Professional',
      price: '$799',
      period: '/month',
      description: 'For growing companies (11–100 employees).',
      features: [
        '3 user seats (+$100 per additional)',
        '10 active job postings',
        'Unlimited candidate profiles',
        'Advanced analytics & reporting',
        'Custom ATS scoring weights',
        'Priority support',
      ],
      successFee: '$2,999 per hire',
      cta: 'Start trial',
      href: '/auth',
      highlight: true,
    },
    {
      name: 'Enterprise',
      price: 'Starting $2,499',
      period: '/month',
      description: 'For large companies (100+ employees).',
      features: [
        'Unlimited user seats',
        'Unlimited job postings',
        'API access',
        'Custom integrations (Greenhouse, Lever, Workday)',
        'White-label option',
        'SLA guarantee (99.9% uptime)',
        'Dedicated account manager',
      ],
      successFee: '$1,999 per hire (or negotiate)',
      cta: 'Contact Sales',
      href: 'mailto:sales@candidatematch.io',
      highlight: false,
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <nav className="bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold bg-gradient-to-r from-brand-400 to-brand-500 bg-clip-text text-transparent">
            CandidateMatch
          </Link>
          <Link href="/auth" className="text-sm bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg font-medium transition">
            Get Started
          </Link>
        </div>
      </nav>

      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-neutral-500 text-lg">For candidates and for companies. Start free; upgrade when you’re ready.</p>
        </div>

        <div className="max-w-5xl mx-auto mb-20">
          <h2 className="text-2xl font-bold mb-6 text-center">For candidates</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {CANDIDATE_PLANS.map((plan) => (
              <PricingCard key={plan.name} {...plan} />
            ))}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 mb-20">
          <h2 className="text-3xl font-bold text-white mb-8 text-center">Feature Comparison</h2>
          <ComparisonTable />
        </div>

        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold mb-2 text-center">For companies</h2>
          <p className="text-center text-neutral-500 text-sm mb-8">
            Traditional recruiter: $15,000+ per hire. CandidateMatch: from $299/mo + success fee — you save 70%+.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {companyPlans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 transition-all ${
                  plan.highlight
                    ? 'bg-gradient-to-b from-brand-600/10 to-brand-500/10 border-2 border-brand-400/30 shadow-xl shadow-blue-600/5'
                    : 'bg-surface-100/50 border border-surface-300'
                }`}
              >
                {plan.highlight && (
                  <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Best value</div>
                )}
                <h3 className="text-2xl font-bold">{plan.name}</h3>
                <div className="mt-2 mb-2">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-neutral-500 text-sm">{plan.period}</span>
                </div>
                {'successFee' in plan && (
                  <p className="text-neutral-400 text-sm mb-4">{plan.successFee}</p>
                )}
                <p className="text-neutral-500 text-sm mb-6">{plan.description}</p>
                <Link
                  href={plan.href}
                  className={`block text-center py-3 rounded-xl font-medium transition ${
                    plan.highlight
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-surface-100/50 hover:bg-surface-200/50 text-neutral-300'
                  }`}
                >
                  {plan.cta}
                </Link>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-neutral-400">
                      <span className="text-blue-400 mt-0.5 shrink-0">✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
