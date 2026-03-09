'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Check } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { AIJobDescriptionGenerator } from './AIJobDescriptionGenerator';
import { SalaryBenchmarkWidget } from './SalaryBenchmarkWidget';
import { Spinner } from '@/components/ui';

const STEPS = [
  { id: 'basics', label: 'Basics', icon: FileText },
  { id: 'description', label: 'Description', icon: FileText },
  { id: 'preview', label: 'Salary & preview', icon: Check },
];

export interface JobFormData {
  title: string;
  companyName: string;
  location: string;
  department: string;
  seniority_level: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
  work_location: 'remote' | 'hybrid' | 'onsite';
  description: string;
  salary_min?: number | null;
  salary_max?: number | null;
}

interface JobCreationWizardProps {
  initialCompanyName?: string;
  onSubmit: (data: JobFormData) => Promise<void>;
  onCancel: () => void;
}

export function JobCreationWizard({
  initialCompanyName = '',
  onSubmit,
  onCancel,
}: JobCreationWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<JobFormData>({
    title: '',
    companyName: initialCompanyName,
    location: '',
    department: '',
    seniority_level: 'mid',
    work_location: 'hybrid',
    description: '',
    salary_min: null,
    salary_max: null,
  });

  const canNext =
    (step === 0 && form.title.trim()) ||
    (step === 1 && form.description.trim()) ||
    step === 2;
  const handleNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else {
      setError('');
      setSaving(true);
      onSubmit(form)
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed to create job'))
        .finally(() => setSaving(false));
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <button
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                step === i
                  ? 'bg-brand-500 text-[#0a0f00]'
                  : 'text-surface-400 hover:text-white hover:bg-surface-700'
              )}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-surface-600 mx-0.5" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Job basics</h2>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Job title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Senior Software Engineer"
              className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Company name</label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Remote / City"
                className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1">Department</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                placeholder="Engineering"
                className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1">Seniority</label>
              <select
                value={form.seniority_level}
                onChange={(e) =>
                  setForm((f) => ({ ...f, seniority_level: e.target.value as JobFormData['seniority_level'] }))
                }
                className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white"
              >
                <option value="entry">Entry</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
                <option value="executive">Executive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1">Work location</label>
              <select
                value={form.work_location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, work_location: e.target.value as JobFormData['work_location'] }))
                }
                className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white"
              >
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <>
          <AIJobDescriptionGenerator
            initialInput={{
              job_title: form.title,
              department: form.department || undefined,
              seniority_level: form.seniority_level,
              work_location: form.work_location,
            }}
            onGenerated={(fullText) => setForm((f) => ({ ...f, description: fullText }))}
          />
          <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-6">
            <label className="block text-sm font-medium text-surface-300 mb-2">Job description *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={12}
              placeholder="Paste or generate with AI above..."
              className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500"
            />
          </div>
        </>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white">Salary (optional)</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-surface-400 mb-1">Min ($)</label>
                  <input
                    type="number"
                    value={form.salary_min ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        salary_min: e.target.value ? parseInt(e.target.value, 10) : null,
                      }))
                    }
                    placeholder="80"
                    className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-surface-400 mb-1">Max ($)</label>
                  <input
                    type="number"
                    value={form.salary_max ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        salary_max: e.target.value ? parseInt(e.target.value, 10) : null,
                      }))
                    }
                    placeholder="120"
                    className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white"
                  />
                </div>
              </div>
            </div>
            <SalaryBenchmarkWidget
              jobTitle={form.title}
              location={form.location || null}
              salaryMin={form.salary_min != null ? form.salary_min * 1000 : null}
              salaryMax={form.salary_max != null ? form.salary_max * 1000 : null}
            />
          </div>
          <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Preview</h2>
            <div className="rounded-xl bg-surface-900 p-4">
              <p className="text-lg font-medium text-white">{form.title}</p>
              <p className="text-surface-500 text-sm mt-1">
                {form.companyName || 'Company'} · {form.location || '—'} · {form.work_location}
              </p>
              <div className="mt-3 text-surface-300 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                {form.description || 'No description.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex items-center justify-between pt-4">
        <button
          type="button"
          onClick={step === 0 ? onCancel : () => setStep((s) => s - 1)}
          className="flex items-center gap-1 px-4 py-2 text-surface-400 hover:text-white rounded-xl font-medium"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canNext || saving}
          className="flex items-center gap-2 px-4 py-2 bg-brand-400 hover:bg-brand-300 disabled:opacity-50 text-[#0a0f00] rounded-xl font-semibold"
        >
          {saving ? <Spinner size={18} /> : null}
          {step < STEPS.length - 1 ? 'Next' : 'Post job'}
        </button>
      </div>
    </div>
  );
}
