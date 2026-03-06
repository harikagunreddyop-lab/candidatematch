'use client';
/**
 * Marketing Landing Page — CandidateMatch
 *
 * Public page at `/`. Modern design with hero, features, social proof, CTA.
 */
import Link from 'next/link';
import { ArrowRight, Zap, Shield, BarChart3, RefreshCw, Users, Sparkles } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white overflow-hidden">
      {/* ── Nav ── */}
      <nav className="fixed top-0 w-full z-50 bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">CandidateMatch</span>
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
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-sm text-blue-300 mb-8">
            <Sparkles className="w-4 h-4" />
            Stop searching. Start executing.
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            The Job Execution OS
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              That Thinks For You
            </span>
          </h1>

          <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            CandidateMatch doesn&apos;t search jobs — it <strong className="text-neutral-200">matches, scores, tailors your resume, and applies</strong>, all autonomously with one click.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth" className="group flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-8 py-3.5 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-blue-600/25">
              Start Free <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/pricing" className="flex items-center gap-2 border border-white/10 hover:border-white/20 px-8 py-3.5 rounded-xl font-medium text-neutral-300 hover:text-white transition-all">
              View Pricing
            </Link>
          </div>

          <p className="text-xs text-neutral-600 mt-6">No credit card required. 5 free runs included.</p>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">One Click. Four Steps. Done.</h2>
          <p className="text-neutral-500 text-center mb-16 max-w-xl mx-auto">
            Our queue-first architecture runs the entire pipeline asynchronously so you never wait.
          </p>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '01', icon: Zap, title: 'Intent', desc: 'Set your target roles, locations, and salary. Tell us what you want.' },
              { step: '02', icon: BarChart3, title: 'Match & Score', desc: 'AI matches you against thousands of jobs and scores each fit with ATS precision.' },
              { step: '03', icon: RefreshCw, title: 'Tailor', desc: 'Your resume is rewritten for each high-scoring match — keyword-perfect and ATS 85+.' },
              { step: '04', icon: Shield, title: 'Apply', desc: 'Auto-apply with tailored resumes. Track outcomes. The system learns and improves.' },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="group bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 rounded-2xl p-6 transition-all">
                <div className="text-xs font-mono text-blue-400/60 mb-3">{step}</div>
                <Icon className="w-8 h-8 text-blue-400 mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="text-lg font-semibold mb-2">{title}</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-6 bg-white/[0.01] border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Built Different</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Shield, title: 'ATS 85+ Guaranteed', desc: 'Deterministic coverage gate ensures every tailored resume passes ATS filters.' },
              { icon: Zap, title: '2-5s Generation', desc: 'Content caching + async rendering = instant results on repeat runs.' },
              { icon: BarChart3, title: 'Evidence-Grounded Scoring', desc: 'Skills must be proven in bullets — listing alone won\u2019t pass the gate.' },
              { icon: RefreshCw, title: 'Closed-Loop Learning', desc: 'Track interview outcomes. The system learns which matches convert.' },
              { icon: Users, title: 'Recruiter + Candidate', desc: 'Dual-sided platform: recruiters assign candidates, candidates self-serve.' },
              { icon: Sparkles, title: 'Queue-First Architecture', desc: 'BullMQ pipeline runs match\u2192score\u2192tailor\u2192apply without blocking.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-5 rounded-xl bg-white/[0.02] border border-white/5">
                <Icon className="w-6 h-6 text-violet-400 mb-3" />
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-neutral-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Stop Searching?</h2>
          <p className="text-neutral-500 mb-8">Join the waitlist and start your first autonomous job run today.</p>
          <Link href="/auth" className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 px-8 py-3.5 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-blue-600/25">
            Get Started Free <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
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
