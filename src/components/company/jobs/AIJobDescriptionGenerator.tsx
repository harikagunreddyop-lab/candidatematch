'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface JobDescriptionInput {
  job_title: string;
  department?: string;
  seniority_level: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
  required_skills?: string[];
  key_responsibilities?: string[];
  company_description?: string;
  benefits?: string[];
  work_location: 'remote' | 'hybrid' | 'onsite';
  tone?: 'formal' | 'casual' | 'innovative';
}

export interface GeneratedJD {
  opening_paragraph: string;
  about_the_role: string;
  what_you_do: string[];
  what_you_bring: string[];
  nice_to_have: string[];
  benefits_section: string;
  about_us: string;
  full_text: string;
}

interface AIJobDescriptionGeneratorProps {
  initialInput?: Partial<JobDescriptionInput>;
  onGenerated: (fullText: string) => void;
  className?: string;
}

export function AIJobDescriptionGenerator({
  initialInput,
  onGenerated,
  className,
}: AIJobDescriptionGeneratorProps) {
  const [job_title, setJobTitle] = useState(initialInput?.job_title ?? '');
  const [department, setDepartment] = useState(initialInput?.department ?? '');
  const [seniority_level, setSeniorityLevel] = useState<JobDescriptionInput['seniority_level']>(
    initialInput?.seniority_level ?? 'mid'
  );
  const [work_location, setWorkLocation] = useState<JobDescriptionInput['work_location']>(
    initialInput?.work_location ?? 'hybrid'
  );
  const [company_description, setCompanyDescription] = useState(
    initialInput?.company_description ?? ''
  );
  const [required_skills, setRequiredSkills] = useState(initialInput?.required_skills?.join(', ') ?? '');
  const [tone, setTone] = useState<JobDescriptionInput['tone'] | ''>(initialInput?.tone ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeneratedJD | null>(null);

  const handleGenerate = async () => {
    if (!job_title.trim()) {
      setError('Job title is required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/company/jobs/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_title: job_title.trim(),
          department: department.trim() || undefined,
          seniority_level,
          work_location,
          company_description: company_description.trim() || undefined,
          required_skills: required_skills
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean),
          tone: tone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setResult(data);
      onGenerated(data.full_text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('rounded-2xl border border-surface-700 bg-surface-800/50 p-6 space-y-4', className)}>
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-amber-400" />
        AI Job Description Generator
      </h3>
      <p className="text-sm text-surface-400">
        Generate an ATS-optimized, inclusive job description. Fill in the basics and click Generate.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Job title *</label>
          <input
            type="text"
            value={job_title}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Senior Software Engineer"
            className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Department</label>
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Engineering"
            className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Seniority</label>
          <select
            value={seniority_level}
            onChange={(e) => setSeniorityLevel(e.target.value as JobDescriptionInput['seniority_level'])}
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
            value={work_location}
            onChange={(e) => setWorkLocation(e.target.value as JobDescriptionInput['work_location'])}
            className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white"
          >
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-300 mb-1">Company description (optional)</label>
        <textarea
          value={company_description}
          onChange={(e) => setCompanyDescription(e.target.value)}
          placeholder="Brief about your company..."
          rows={2}
          className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-surface-300 mb-1">Required skills (comma-separated)</label>
        <input
          type="text"
          value={required_skills}
          onChange={(e) => setRequiredSkills(e.target.value)}
          placeholder="e.g. React, TypeScript, Node.js"
          className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-surface-300 mb-1">Tone (optional)</label>
        <select
          value={tone}
          onChange={(e) => setTone((e.target.value || '') as JobDescriptionInput['tone'] | '')}
          className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white"
        >
          <option value="">Professional</option>
          <option value="formal">Formal</option>
          <option value="casual">Casual</option>
          <option value="innovative">Innovative</option>
        </select>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-[#0a0f00] rounded-xl font-semibold"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Generating...' : 'Generate description'}
      </button>

      {result && (
        <div className="pt-4 border-t border-surface-700">
          <p className="text-sm text-surface-400 mb-2">Preview (already applied to description below):</p>
          <div className="rounded-xl bg-surface-900 p-4 text-surface-300 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
            {result.full_text.slice(0, 800)}
            {result.full_text.length > 800 && '...'}
          </div>
        </div>
      )}
    </div>
  );
}
