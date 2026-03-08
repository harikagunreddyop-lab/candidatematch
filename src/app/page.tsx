'use client';
/**
 * Marketing Landing Page — CandidateMatch
 * Public page at `/`. Human-crafted copy: one clear promise, outcome-led steps, minimal decoration.
 */
import Link from 'next/link';
import { ArrowRight, Zap, BarChart3, RefreshCw, Shield, Users } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white overflow-hidden">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            CandidateMatch
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-neutral-400">
            <Link href="/pricing" className="hover:text-white transition">Pricing</Link>
            <Link href="/terms" className="hover:text-white transition">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth" className="text-sm text-neutral-300 hover:text-white transition px-4 py-2">
              Sign in
            </Link>
            <Link href="/auth" className="text-sm bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-blue-600/20">
              Create account
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.15] mb-6 text-white">
            Match to the right jobs. One profile. One place.
          </h1>
          <p className="text-lg md:text-xl text-neutral-400 max-w-xl mx-auto mb-10 leading-relaxed">
            We match you to roles that fit, tailor your resume for each one, and help you apply from one place.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth" className="group flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-8 py-3.5 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-blue-600/25">
              Create free account <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/pricing" className="flex items-center gap-2 border border-white/10 hover:border-white/20 px-8 py-3.5 rounded-xl font-medium text-neutral-300 hover:text-white transition-all">
              View Pricing
            </Link>
          </div>
          <p className="text-xs text-neutral-500 mt-6">No credit card required.</p>
        </div>
      </section>

      {/* How it works — 4 outcome-led steps */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-3 text-white">How it works</h2>
          <p className="text-neutral-500 text-center mb-12 max-w-lg mx-auto">
            You set your targets. We find matches, tailor your resume, and help you apply.
          </p>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '1', icon: Zap, title: 'Set your targets', desc: 'Tell us the roles, locations, and salary range you want.' },
              { step: '2', icon: BarChart3, title: 'We match and score', desc: 'You get a shortlist of jobs that fit, with a clear fit score for each.' },
              { step: '3', icon: RefreshCw, title: 'Resumes tailored per job', desc: 'Each application gets a resume written for that role so it passes filters.' },
              { step: '4', icon: Shield, title: 'Apply and track', desc: 'Apply from one place and see which applications move forward.' },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="bg-surface-100/50 hover:bg-surface-200/50 border border-surface-300 rounded-2xl p-6 transition-all">
                <div className="text-xs font-mono text-blue-400/70 mb-3">Step {step}</div>
                <Icon className="w-7 h-7 text-blue-400 mb-3" />
                <h3 className="text-base font-semibold mb-1.5 text-white">{title}</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits — 4 cards, plain language */}
      <section className="py-20 px-6 bg-surface-100/30 border-t border-surface-300">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-3 text-white">Why CandidateMatch</h2>
          <p className="text-neutral-500 text-center mb-12 max-w-lg mx-auto">
            Built so you spend less time applying and more time on roles that fit.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: Shield, title: 'Resumes that pass filters', desc: 'Each resume is tailored to the job so it gets past applicant systems.' },
              { icon: Zap, title: 'One profile, many applications', desc: 'Update your details once. We adapt them for every application.' },
              { icon: BarChart3, title: 'Evidence-based matching', desc: 'Fit scores reflect your experience and skills, not just keywords.' },
              { icon: Users, title: 'For candidates and recruiters', desc: 'Candidates apply smarter. Recruiters match and manage talent in one place.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-5 rounded-xl bg-surface-100/50 border border-surface-300">
                <Icon className="w-6 h-6 text-blue-400 mb-3" />
                <h3 className="font-semibold mb-1 text-white">{title}</h3>
                <p className="text-sm text-neutral-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 text-white">One profile. Better matches. Fewer dead ends.</h2>
          <p className="text-neutral-500 mb-8">Create your free account and connect your first run.</p>
          <Link href="/auth" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-8 py-3.5 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-blue-600/25">
            Create free account <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between text-sm text-neutral-600">
          <span>&copy; {new Date().getFullYear()} CandidateMatch. All rights reserved.</span>
          <div className="flex gap-6 mt-4 md:mt-0">
            <Link href="/terms" className="hover:text-neutral-400 transition">Terms</Link>
            <Link href="/privacy" className="hover:text-neutral-400 transition">Privacy</Link>
            <Link href="/pricing" className="hover:text-neutral-400 transition">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
