'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Upload, Target, ArrowRight } from 'lucide-react';

function StepDot({ active }: { active: boolean }) {
  return (
    <div
      className={`w-3 h-3 rounded-full transition-all ${
        active ? 'bg-brand-400' : 'bg-surface-700'
      }`}
    />
  );
}

function WelcomeStep({
  icon,
  title,
  description,
  onNext,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onNext: () => void;
}) {
  return (
    <div className="rounded-2xl border border-surface-700 bg-surface-800/80 p-8 text-center">
      <div className="w-14 h-14 rounded-xl bg-brand-400/20 flex items-center justify-center text-brand-400 mx-auto mb-6">
        {icon}
      </div>
      <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
      <p className="text-surface-400 mb-8">{description}</p>
      <button
        type="button"
        onClick={onNext}
        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-400 hover:bg-brand-300 text-white font-semibold rounded-xl transition-colors"
      >
        Next
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function CandidateWelcome() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <Sparkles className="w-16 h-16 text-brand-400 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white mb-3">
            Welcome to CandidateMatch
          </h1>
          <p className="text-xl text-surface-400">
            Let&apos;s get you started in 3 simple steps
          </p>
        </div>

        {/* Progress */}
        <div className="flex justify-center gap-2 mb-12">
          <StepDot active={step >= 1} />
          <StepDot active={step >= 2} />
          <StepDot active={step >= 3} />
        </div>

        {/* Steps */}
        {step === 1 && (
          <WelcomeStep
            icon={<Upload className="w-7 h-7" />}
            title="Upload Your Resume"
            description="We'll analyze your skills and experience using AI"
            onNext={() => router.push('/dashboard/candidate/profile/resume')}
          />
        )}

        {step === 2 && (
          <WelcomeStep
            icon={<Target className="w-7 h-7" />}
            title="Set Your Preferences"
            description="Tell us what you're looking for in your next role"
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <div className="rounded-2xl border border-surface-700 bg-surface-800/80 p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">You&apos;re all set!</h2>
            <p className="text-surface-400 mb-8">
              We&apos;re finding your best matches now...
            </p>
            <button
              type="button"
              onClick={() => router.push('/dashboard/candidate')}
              className="btn-primary inline-flex items-center gap-2"
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="text-center mt-8">
          <button
            type="button"
            onClick={() => router.push('/dashboard/candidate')}
            className="text-sm text-surface-500 hover:text-surface-400"
          >
            Skip to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
