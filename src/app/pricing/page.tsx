import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Pricing — CandidateMatch',
    description: 'Simple, transparent pricing for job seekers and recruiters.',
};

export default function PricingPage() {
    const plans = [
        {
            name: 'Free',
            price: '$0',
            period: 'forever',
            description: 'Try the platform with limited runs.',
            features: ['5 application runs', 'Basic matching', 'Manual resume upload', 'Email support'],
            cta: 'Get Started',
            href: '/auth',
            highlight: false,
        },
        {
            name: 'Pro',
            price: '$29',
            period: '/month',
            description: 'For active job seekers who want full automation.',
            features: [
                'Unlimited runs',
                'ATS 85+ resume tailoring',
                'Auto-apply pipeline',
                'Priority queue processing',
                'Outcome tracking',
                'Priority support',
            ],
            cta: 'Start Pro Trial',
            href: '/auth',
            highlight: true,
        },
        {
            name: 'Enterprise',
            price: 'Custom',
            period: '',
            description: 'For recruiters and staffing agencies.',
            features: [
                'Multi-candidate management',
                'Recruiter dashboard',
                'API access',
                'Custom integrations',
                'Dedicated support',
                'SLA guarantee',
            ],
            cta: 'Contact Sales',
            href: 'mailto:sales@candidatematch.io',
            highlight: false,
        },
    ];

    return (
        <div className="min-h-screen bg-neutral-950 text-white">
            {/* Nav */}
            <nav className="bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <a href="/" className="text-xl font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
                        CandidateMatch
                    </a>
                    <a href="/auth" className="text-sm bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg font-medium transition">
                        Get Started
                    </a>
                </div>
            </nav>

            <section className="py-20 px-6">
                <div className="max-w-5xl mx-auto text-center mb-16">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
                    <p className="text-neutral-500 text-lg">Start free. Upgrade when you&apos;re ready to automate.</p>
                </div>

                <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
                    {plans.map((plan) => (
                        <div
                            key={plan.name}
                            className={`rounded-2xl p-8 transition-all ${plan.highlight
                                    ? 'bg-gradient-to-b from-blue-600/10 to-violet-600/10 border-2 border-blue-500/30 shadow-xl shadow-blue-600/5'
                                    : 'bg-white/[0.02] border border-white/5'
                                }`}
                        >
                            {plan.highlight && (
                                <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Most Popular</div>
                            )}
                            <h3 className="text-2xl font-bold">{plan.name}</h3>
                            <div className="mt-2 mb-4">
                                <span className="text-4xl font-bold">{plan.price}</span>
                                <span className="text-neutral-500 text-sm">{plan.period}</span>
                            </div>
                            <p className="text-neutral-500 text-sm mb-6">{plan.description}</p>
                            <a
                                href={plan.href}
                                className={`block text-center py-3 rounded-xl font-medium transition-all ${plan.highlight
                                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                        : 'bg-white/5 hover:bg-white/10 text-neutral-300'
                                    }`}
                            >
                                {plan.cta}
                            </a>
                            <ul className="mt-6 space-y-3">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex items-start gap-2 text-sm text-neutral-400">
                                        <span className="text-blue-400 mt-0.5">✓</span> {f}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
