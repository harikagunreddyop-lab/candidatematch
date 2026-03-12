'use client';
/**
 * Marketing Landing Page — CandidateMatch
 * Public page at `/`. Human-crafted copy: one clear promise, outcome-led steps, minimal decoration.
 */
import Link from 'next/link';
import { ArrowRight, Zap, BarChart3, RefreshCw, Shield, Users } from 'lucide-react';
import ThreeDMarqueeDemo from '@/components/3d-marquee-demo';

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
            <Link href="/auth" className="text-sm bg-white text-black hover:bg-neutral-200 px-5 py-2 rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-neutral-500/20">
              Create account
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-1.5 text-xs font-medium text-neutral-300 mb-5">
            Understand how hiring systems actually see you
          </span>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6 text-white">
            Turn your experience into a clear, recruiter‑ready profile.
          </h1>
          <p className="text-lg md:text-xl text-neutral-300 max-w-2xl mx-auto mb-8 leading-relaxed">
            CandidateMatch reads your resume, understands the roles you want, and scores you the way a modern ATS
            and recruiter would—then tells you what to improve, step by step.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth"
              className="group flex items-center gap-2 bg-white text-black hover:bg-neutral-200 px-8 py-3.5 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-neutral-500/25"
            >
              Start with your resume
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/auth?view=recruiter"
              className="text-sm text-neutral-300 hover:text-white underline-offset-4 hover:underline"
            >
              For recruiting teams
            </Link>
          </div>
          <p className="text-xs text-neutral-500 mt-6">
            Free to start. No credit card required. Built for candidates, trusted by recruiters.
          </p>
        </div>
      </section>

      {/* How the system works */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-3 text-white">How CandidateMatch works</h2>
          <p className="text-neutral-400 text-center mb-12 max-w-2xl mx-auto">
            Under the hood we act like a modern applicant tracking system that both candidates and recruiters can
            understand. You bring your experience and roles. We handle the structure, scoring, and explanation.
          </p>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                step: '1',
                icon: Zap,
                title: 'Understand your goals',
                desc: 'Tell us the roles and level you are targeting. Recruiters define the role profile they are hiring for.',
              },
              {
                step: '2',
                icon: BarChart3,
                title: 'Parse & structure',
                desc: 'We turn free‑text resumes and job descriptions into structured skills, experience, and requirements.',
              },
              {
                step: '3',
                icon: RefreshCw,
                title: 'Score with evidence',
                desc: 'Our engine scores candidates against role rubrics, highlighting concrete examples that support each skill.',
              },
              {
                step: '4',
                icon: Shield,
                title: 'Explain & act',
                desc: 'Candidates see what to fix. Recruiters see why someone is a strong, medium, or weak match.',
              },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div
                key={step}
                className="bg-surface-100/50 hover:bg-surface-200/50 border border-surface-300 rounded-2xl p-6 transition-all"
              >
                <div className="text-xs font-mono text-neutral-400 mb-3">Step {step}</div>
                <Icon className="w-7 h-7 text-neutral-300 mb-3" />
                <h3 className="text-base font-semibold mb-1.5 text-white">{title}</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product gallery — 3D marquee */}
      <section className="py-16 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto text-center mb-6">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 text-white">See CandidateMatch in motion</h2>
          <p className="text-neutral-400 max-w-2xl mx-auto">
            A rotating gallery of the tools candidates and recruiters use every day—fit scores, explanations, and
            evidence, all in one workspace.
          </p>
        </div>
        <ThreeDMarqueeDemo />
      </section>

      {/* What candidates can do */}
      <section className="py-20 px-6 bg-surface-100/30 border-t border-surface-300">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 text-white">What candidates can do</h2>
            <p className="text-neutral-400 max-w-2xl mx-auto">
              You stay in control. CandidateMatch simply makes it obvious how your experience lines up with the roles
              you want—and what to change before you hit apply.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: BarChart3,
                title: 'See your match score',
                desc: 'Upload your resume, pick a role, and see how you score against what recruiters actually look for.',
                why: 'Know in advance which roles are worth your time.',
              },
              {
                icon: Zap,
                title: 'Spot gaps & easy wins',
                desc: 'We flag missing skills, weak sections, and vague bullets that could be costing you interviews.',
                why: 'Fix issues before an ATS or recruiter screens you out.',
              },
              {
                icon: RefreshCw,
                title: 'Tailor your resume in minutes',
                desc: 'Turn one core profile into targeted versions for each role family without rewriting from scratch.',
                why: 'Spend time on better applications, not endless formatting.',
              },
            ].map(({ icon: Icon, title, desc, why }) => (
              <div key={title} className="p-5 rounded-xl bg-surface-100/60 border border-surface-300">
                <Icon className="w-6 h-6 text-neutral-300 mb-3" />
                <h3 className="font-semibold mb-1.5 text-white">{title}</h3>
                <p className="text-sm text-neutral-400 mb-3">{desc}</p>
                <p className="text-xs text-neutral-500">Why it matters: {why}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How this helps candidates */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto grid md:grid-cols-[1.4fr,1fr] gap-10 items-start">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3 text-white">How this helps candidates</h2>
            <p className="text-neutral-400 mb-6">
              Instead of guessing what happens after you apply, you get a clear picture of how your profile is read and
              scored—plus a concrete plan to improve it.
            </p>
            <ul className="space-y-3 text-sm text-neutral-300">
              <li>
                <span className="font-semibold text-white">More interviews from the same effort.</span>{' '}
                Focus applications on roles where you are a strong or near‑strong match instead of spraying and
                praying.
              </li>
              <li>
                <span className="font-semibold text-white">Less time rewriting resumes.</span> Keep one living profile
                and let CandidateMatch adapt it for each opportunity.
              </li>
              <li>
                <span className="font-semibold text-white">A roadmap for where to grow.</span> See which skills keep
                showing up across the roles you want so you can plan learning and projects with intent.
              </li>
            </ul>
          </div>
          <div className="bg-surface-100/40 border border-surface-300 rounded-2xl p-5 text-sm text-neutral-300">
            <p className="text-xs font-mono text-neutral-400 mb-2">Example</p>
            <p className="mb-3">
              A data analyst wants to move into a product analytics role. CandidateMatch scores them against a typical
              product analytics profile and shows they are strong on SQL and experimentation, but light on stakeholder
              communication and roadmap influence examples.
            </p>
            <p>
              They use our prompts to rewrite experience bullets with clearer outcomes and add one small side project to
              close the gap. Their score moves from “medium” to “strong”, and they start getting interviews for the
              roles they actually want.
            </p>
          </div>
        </div>
      </section>

      {/* What recruiters can do */}
      <section className="py-20 px-6 bg-surface-100/30 border-t border-surface-300">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold mb-3 text-white">What recruiters can do</h2>
              <p className="text-neutral-400 max-w-xl">
                CandidateMatch gives your team a shared, evidence‑based view of each candidate, instead of one‑off notes
                and keyword searches.
              </p>
            </div>
            <p className="text-xs text-neutral-500">
              Built to layer on top of your existing ATS and workflows.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Users,
                title: 'Define structured role profiles',
                desc: 'Capture the skills, scope, and level you actually need in a reusable rubric candidates are scored against.',
              },
              {
                icon: BarChart3,
                title: 'Rank by evidence, not noise',
                desc: 'See candidates ordered by how well their real experience supports your requirements—beyond exact keyword matches.',
              },
              {
                icon: Shield,
                title: 'Show your work',
                desc: 'Drill into why someone is a strong or weak match and keep an audit trail you can share with hiring managers.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-5 rounded-xl bg-surface-100/60 border border-surface-300">
                <Icon className="w-6 h-6 text-neutral-300 mb-3" />
                <h3 className="font-semibold mb-1.5 text-white">{title}</h3>
                <p className="text-sm text-neutral-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How this helps recruiters */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3 text-white">How this helps recruiters</h2>
            <p className="text-neutral-400 mb-6">
              Whether you run an in‑house team or an agency desk, CandidateMatch reduces manual sift time and makes
              hiring conversations more objective.
            </p>
            <ul className="space-y-3 text-sm text-neutral-300">
              <li>
                <span className="font-semibold text-white">Faster, higher‑signal shortlists.</span> Move from hundreds
                of resumes to a prioritized stack of candidates in minutes.
              </li>
              <li>
                <span className="font-semibold text-white">Better alignment with hiring managers.</span> Review
                candidates against a clear rubric instead of subjective impressions.
              </li>
              <li>
                <span className="font-semibold text-white">More consistent, fair screening.</span> Apply the same
                criteria across every applicant, with explanations you can stand behind.
              </li>
            </ul>
          </div>
          <div className="bg-surface-100/40 border border-surface-300 rounded-2xl p-5 text-sm text-neutral-300">
            <p className="text-xs font-mono text-neutral-400 mb-2">For teams</p>
            <p className="mb-3">
              Use CandidateMatch alongside your existing ATS to standardize what “good” looks like across similar roles
              and locations, then have your sourcers and coordinators work from the same, explained scores.
            </p>
            <p>
              Over time, feedback from hires and rejections feeds back into the profiles you use, so every search gets a
              little sharper.
            </p>
          </div>
        </div>
      </section>

      {/* Why it’s different */}
      <section className="py-20 px-6 bg-surface-100/30 border-t border-surface-300">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 text-white text-center">Why CandidateMatch is different</h2>
          <p className="text-neutral-400 text-center max-w-2xl mx-auto mb-10">
            Underneath the simple interface is an engine that was built to understand role families, evidence, and
            explainability—not just keywords on a page.
          </p>
          <div className="grid md:grid-cols-3 gap-6 text-sm text-neutral-300">
            <div className="p-5 rounded-xl bg-surface-100/60 border border-surface-300">
              <h3 className="font-semibold mb-2 text-white">Evidence‑first scoring</h3>
              <p>
                We look for concrete achievements, projects, and responsibilities that support each requirement and
                surface those back to candidates and recruiters.
              </p>
            </div>
            <div className="p-5 rounded-xl bg-surface-100/60 border border-surface-300">
              <h3 className="font-semibold mb-2 text-white">Role‑family aware</h3>
              <p>
                Our rubrics understand that “data analyst”, “product analyst”, and “analytics engineer” overlap—so we
                can help you move within a family of roles, not start from zero each time.
              </p>
            </div>
            <div className="p-5 rounded-xl bg-surface-100/60 border border-surface-300">
              <h3 className="font-semibold mb-2 text-white">Shared explanations</h3>
              <p>
                The same explanation a candidate sees is what a recruiter sees, which keeps expectations aligned on both
                sides of the hiring process.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof / trust */}
      <section className="py-16 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-xl md:text-2xl font-semibold mb-3 text-white">Built with both sides in mind</h2>
          <p className="text-neutral-400 max-w-2xl mx-auto mb-8">
            CandidateMatch is designed for serious candidates and recruiting teams who care about clarity, fairness, and
            better decisions—not hacks or one‑off templates.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-neutral-500">
            <span className="px-3 py-1 rounded-full border border-white/5 bg-white/5">
              Placeholder: add company logos here
            </span>
            <span className="px-3 py-1 rounded-full border border-white/5 bg-white/5">
              Placeholder: add candidate testimonials here
            </span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white text-center">Questions you might have</h2>
          <p className="text-neutral-400 text-center mb-10 max-w-2xl mx-auto">
            A quick overview for both candidates and recruiters. If you are unsure whether CandidateMatch fits your
            situation, start with your resume—it&apos;s the fastest way to see.
          </p>
          <div className="space-y-6 text-sm text-neutral-300">
            <div>
              <h3 className="font-semibold text-white mb-1">Does CandidateMatch replace my recruiter or ATS?</h3>
              <p>
                No. For candidates, it helps you present yourself more clearly to any recruiter or ATS. For teams, it
                sits alongside your existing tools to improve how you screen and discuss candidates.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Can this help if I&apos;m changing careers?</h3>
              <p>
                Yes. Because we work with role families and evidence, we can highlight transferable skills and show you
                what examples you are missing for the roles you want to grow into.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Is my data safe?</h3>
              <p>
                We only use your data to power your experience in CandidateMatch. You stay in control of your account,
                and you can remove your information at any time. See our Privacy Policy for details.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Do recruiters see everything I do as a candidate?</h3>
              <p>
                No. Recruiters see structured profiles and scores when you choose to share or apply. The private
                recommendations and drafts you work on as a candidate are for you.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">How long does it take to get value?</h3>
              <p>
                Most candidates see useful insights within a few minutes of connecting their resume and picking a role.
                Recruiters typically see value on their very first shortlist.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">What does onboarding look like for teams?</h3>
              <p>
                We help you define or import a few core role profiles, then calibrate scores on a handful of candidates.
                From there, your team can reuse and refine those profiles across searches.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 text-white">
            One profile. Clearer signals. Better decisions.
          </h2>
          <p className="text-neutral-400 mb-8">
            Start by seeing how a modern hiring system reads your resume, then use those insights to improve every
            application that comes after.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 bg-white text-black hover:bg-neutral-200 px-8 py-3.5 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-neutral-500/25"
            >
              Start with your resume
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/auth?view=recruiter"
              className="text-sm text-neutral-300 hover:text-white underline-offset-4 hover:underline"
            >
              Talk to us about your team
            </Link>
          </div>
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
