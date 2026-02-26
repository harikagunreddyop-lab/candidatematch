'use client';
// src/app/dashboard/recruiter/candidates/[id]/page.tsx

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Tabs, StatusBadge, Spinner, EmptyState } from '@/components/ui';
import {
  ArrowLeft, MapPin, Sparkles, Download, CheckCircle2,
  ExternalLink, FileText, Briefcase, Brain, Mail,
  Calendar, Phone, Linkedin, Star, Copy, Check,
  Save, Edit2, Plus, X, AlertCircle, Send, Upload,
} from 'lucide-react';
import { formatDate, formatRelative, cn } from '@/utils/helpers';

const STATUS_OPTIONS = ['ready', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];
const VISA_OPTIONS = ['US Citizen','Green Card','H1B','H4 EAD','L2 EAD','OPT','CPT','TN Visa','O1','Requires Sponsorship','Other'];
const AVAILABILITY_OPTIONS = ['Immediately','2 Weeks','1 Month','3 Months','Not Looking'];
const EDUCATION_LEVELS = ["High School","Associate's","Bachelor's","Master's","MBA","PhD","MD","JD","Bootcamp","Self-Taught","Other"];
const LANGUAGE_LEVELS = ['Basic','Conversational','Proficient','Fluent','Native'];
const MAX_RESUMES_PER_CANDIDATE = 5;

function safeArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    if (val === '{}') return [];
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

function scoreColor(score: number) {
  if (score >= 85) return 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-200';
  if (score >= 70) return 'bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-200';
  if (score >= 50) return 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-200';
  return 'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300';
}

function TagInput({ value, onChange, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const inputId = useMemo(() => 'ti-' + Math.random().toString(36).slice(2, 7), []);
  const add = () => {
    const t = input.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput('');
  };
  return (
    <div
      className="flex flex-wrap gap-1.5 p-2 border border-surface-600 rounded-lg min-h-[40px] cursor-text bg-surface-800"
      onClick={() => document.getElementById(inputId)?.focus()}
    >
      {value.map((tag, i) => (
        <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-200 rounded-md text-xs font-medium">
          {tag}
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(value.filter((_, j) => j !== i)); }}>
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        id={inputId}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] outline-none text-xs bg-transparent placeholder-surface-400"
      />
    </div>
  );
}

export default function RecruiterCandidateDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [candidate, setCandidate] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [resumes, setResumes] = useState<any[]>([]);
  const [candidateResumes, setCandidateResumes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notAssigned, setNotAssigned] = useState(false);
  const [tab, setTab] = useState('profile');
  const [resumeGenerationAllowed, setResumeGenerationAllowed] = useState(false);
  const [viewingJdJob, setViewingJdJob] = useState<{ title: string; company: string; jd: string } | null>(null);

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [profileForm, setProfileForm] = useState<any>({});

  // AI tools
  const [generating, setGenerating] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [briefJobId, setBriefJobId] = useState<string | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [emailJobId, setEmailJobId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Profile autofill with AI (recruiter-triggered)
  const [autofilling, setAutofilling] = useState(false);
  const [autofillError, setAutofillError] = useState<string | null>(null);
  const [autofillSuccess, setAutofillSuccess] = useState(false);

  // On-demand ATS check (only for 50+ profile matches)
  const [atsRunningByJob, setAtsRunningByJob] = useState<Record<string, boolean>>({});
  const [atsErrorByJob, setAtsErrorByJob] = useState<Record<string, string>>({});
  const [selectedAtsResumeByJob, setSelectedAtsResumeByJob] = useState<Record<string, string>>({});

  // Interview scheduling
  const [schedulingAppId, setSchedulingAppId] = useState<string | null>(null);
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [savingInterview, setSavingInterview] = useState(false);

  // Recruiter-uploaded resumes for this candidate
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Two-step apply flow:
  // Step 1 — "Apply Now" opens job URL and sets pendingApply = job_id
  // Step 2 — "Confirm Applied" saves to DB and clears pendingApply
  const [pendingApply, setPendingApply] = useState<string | null>(null);
  const [confirmingApply, setConfirmingApply] = useState<string | null>(null);

  const initForm = useCallback((cand: any) => {
    setProfileForm({
      full_name: cand.full_name || '',
      primary_title: cand.primary_title || '',
      email: cand.email || '',
      phone: cand.phone || '',
      location: cand.location || '',
      linkedin_url: cand.linkedin_url || '',
      github_url: cand.github_url || '',
      portfolio_url: cand.portfolio_url || '',
      summary: cand.summary || '',
      visa_status: cand.visa_status || '',
      citizenship: cand.citizenship || '',
      skills: safeArray(cand.skills),
      soft_skills: safeArray(cand.soft_skills),
      tools: safeArray(cand.tools),
      languages: safeArray(cand.languages),
      years_of_experience: cand.years_of_experience?.toString() || '',
      highest_education: cand.highest_education || '',
      gpa: cand.gpa || '',
      experience: JSON.stringify(safeArray(cand.experience), null, 2),
      education: JSON.stringify(safeArray(cand.education), null, 2),
      certifications: JSON.stringify(safeArray(cand.certifications), null, 2),
      availability: cand.availability || '',
      notice_period: cand.notice_period || '',
      salary_min: cand.salary_min?.toString() || '',
      salary_max: cand.salary_max?.toString() || '',
      open_to_remote: cand.open_to_remote ?? true,
      open_to_relocation: cand.open_to_relocation ?? false,
      target_roles: safeArray(cand.target_roles),
      target_locations: safeArray(cand.target_locations),
      rating: cand.rating || 0,
      internal_notes: cand.internal_notes || '',
      interview_notes: cand.interview_notes || '',
      active: cand.active ?? true,
    });
  }, []);

  const load = useCallback(async (reinitForm = true) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: assignment } = await supabase
      .from('recruiter_candidate_assignments')
      .select('candidate_id')
      .eq('recruiter_id', user.id)
      .eq('candidate_id', id)
      .single();

    if (!assignment) { setNotAssigned(true); setLoading(false); return; }

    const { data: myProfile } = await supabase.from('profiles').select('resume_generation_allowed').eq('id', user.id).single();
    setResumeGenerationAllowed(myProfile?.resume_generation_allowed === true);

    const [candRes, matchRes, appRes, resumeRes, candResumeRes] = await Promise.all([
      supabase.from('candidates').select('*').eq('id', id).single(),
      supabase.from('candidate_job_matches').select('*, job:jobs(*)').eq('candidate_id', id).order('fit_score', { ascending: false }),
      supabase.from('applications').select('*, job:jobs(*), resume_version:resume_versions(*)').eq('candidate_id', id).order('created_at', { ascending: false }),
      supabase.from('resume_versions').select('*, job:jobs(*)').eq('candidate_id', id).order('created_at', { ascending: false }),
      supabase.from('candidate_resumes').select('*').eq('candidate_id', id).order('uploaded_at', { ascending: false }),
    ]);

    const cand = candRes.data;
    let merged = cand;
    if (cand?.user_id) {
      const { data: profile } = await supabase.from('profiles').select('name, email, phone').eq('id', cand.user_id).single();
      merged = { ...cand, full_name: profile?.name ?? cand.full_name, email: profile?.email ?? cand.email, phone: profile?.phone ?? cand.phone };
    }
    setCandidate(merged);
    setMatches(matchRes.data || []);
    setApplications(appRes.data || []);
    setResumes(resumeRes.data || []);
    setCandidateResumes(candResumeRes.data || []);
    if (merged && reinitForm) initForm(merged);
    setLoading(false);
  }, [id, supabase, initForm]);

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const channel = supabase.channel(`recruiter-candidate-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates', filter: `id=eq.${id}` },
        () => { if (!editingProfile) load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications', filter: `candidate_id=eq.${id}` },
        () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resume_versions', filter: `candidate_id=eq.${id}` },
        () => load(false))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, supabase, editingProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => setProfileForm((p: any) => ({ ...p, [k]: v }));

  const saveProfile = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    let experience, education, certifications;
    try {
      experience = JSON.parse(profileForm.experience || '[]');
      education = JSON.parse(profileForm.education || '[]');
      certifications = JSON.parse(profileForm.certifications || '[]');
    } catch {
      setSaveError('Invalid JSON in Experience, Education, or Certifications.');
      setSaving(false);
      return;
    }
    // Name, email, phone are admin-only; recruiter cannot edit them (single source of truth: profile)
    const { error } = await supabase.from('candidates').update({
      primary_title: profileForm.primary_title,
      location: profileForm.location || null,
      linkedin_url: profileForm.linkedin_url || null,
      github_url: profileForm.github_url || null,
      portfolio_url: profileForm.portfolio_url || null,
      summary: profileForm.summary || null,
      visa_status: profileForm.visa_status || null,
      citizenship: profileForm.citizenship || null,
      skills: profileForm.skills,
      soft_skills: profileForm.soft_skills,
      tools: profileForm.tools,
      languages: profileForm.languages,
      years_of_experience: profileForm.years_of_experience ? parseInt(profileForm.years_of_experience) : null,
      highest_education: profileForm.highest_education || null,
      gpa: profileForm.gpa || null,
      experience, education, certifications,
      availability: profileForm.availability || null,
      notice_period: profileForm.notice_period || null,
      salary_min: profileForm.salary_min ? parseInt(profileForm.salary_min) : null,
      salary_max: profileForm.salary_max ? parseInt(profileForm.salary_max) : null,
      open_to_remote: profileForm.open_to_remote,
      open_to_relocation: profileForm.open_to_relocation,
      target_roles: profileForm.target_roles,
      target_locations: profileForm.target_locations,
      rating: profileForm.rating || null,
      internal_notes: profileForm.internal_notes || null,
      interview_notes: profileForm.interview_notes || null,
      active: profileForm.active,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (error) { setSaveError(error.message); setSaving(false); return; }

    setSaving(false);
    setSaveSuccess(true);
    setEditingProfile(false);
    setTimeout(() => setSaveSuccess(false), 3000);
    const { data: fresh } = await supabase.from('candidates').select('*').eq('id', id).single();
    if (fresh) { setCandidate(fresh); initForm(fresh); }
  };

  const cancelEdit = () => {
    setEditingProfile(false);
    setSaveError(null);
    if (candidate) initForm(candidate);
  };

  const handleAutofillWithAI = async () => {
    setAutofillError(null);
    setAutofillSuccess(false);
    setAutofilling(true);
    try {
      const res = await fetch('/api/profile/ai-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAutofillError(data.error || 'Autofill failed');
        return;
      }
      setAutofillSuccess(true);
      await load(true);
    } finally {
      setAutofilling(false);
    }
  };

  const generateBrief = async (jobId: string) => {
    setBriefJobId(jobId); setBrief(null); setEmailJobId(null); setBriefLoading(true);
    try {
      const res = await fetch('/api/recruiter-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'brief', candidate_id: id, job_id: jobId }),
      });
      const data = await res.json();
      setBrief(data.result || data.error || 'Failed to generate');
    } catch { setBrief('Failed to generate brief'); }
    setBriefLoading(false);
  };

  const generateEmail = async (jobId: string) => {
    setEmailJobId(jobId); setEmailDraft(null); setBriefJobId(null); setEmailLoading(true);
    try {
      const res = await fetch('/api/recruiter-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'email', candidate_id: id, job_id: jobId }),
      });
      const data = await res.json();
      setEmailDraft(data.result || data.error || 'Failed to generate');
    } catch { setEmailDraft('Failed to draft email'); }
    setEmailLoading(false);
  };

  const generateResume = async (jobId: string) => {
    setGenerating(jobId);
    setResumeError(null);
    try {
      const res = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: id, job_id: jobId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await load(false);
      } else {
        setResumeError([data.error, data.hint].filter(Boolean).join(' ') || 'Resume generation failed');
      }
    } catch (e) {
      console.error(e);
      setResumeError('Network error. Try again.');
    }
    setGenerating(null);
  };

  const runAtsForJob = async (jobId: string, resumeId: string | null) => {
    setAtsRunningByJob(p => ({ ...p, [jobId]: true }));
    setAtsErrorByJob(p => ({ ...p, [jobId]: '' }));
    try {
      const res = await fetch('/api/ats/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: id, job_id: jobId, resume_id: resumeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'ATS check failed');
      await load(false);
    } catch (e: any) {
      setAtsErrorByJob(p => ({ ...p, [jobId]: e?.message || 'ATS check failed' }));
    } finally {
      setAtsRunningByJob(p => ({ ...p, [jobId]: false }));
    }
  };

  // Step 1: open the job URL in a new tab + enter pending state
  const handleApplyNow = (jobId: string, jobUrl: string | null) => {
    if (jobUrl) window.open(jobUrl, '_blank', 'noopener,noreferrer');
    setPendingApply(jobId);
  };

  // Step 2: recruiter confirms they actually submitted — saves to DB (via API for limit enforcement)
  const confirmApplied = async (jobId: string) => {
    setConfirmingApply(jobId);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: id, job_id: jobId, status: 'applied', applied_at: new Date().toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResumeError(data.error || 'Could not record application');
        setConfirmingApply(null);
        return;
      }
      setPendingApply(null);
      setConfirmingApply(null);
      await load(false);
    } finally {
      setConfirmingApply(null);
    }
  };

  // Used from Resumes tab
  const markApplied = async (jobId: string, resumeVersionId?: string) => {
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_id: id,
        job_id: jobId,
        resume_version_id: resumeVersionId ?? null,
        status: 'applied',
        applied_at: new Date().toISOString(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setResumeError(data.error || 'Could not record application');
    await load(false);
  };

  const updateStatus = async (appId: string, status: string) => {
    await supabase.from('applications').update({
      status,
      ...(status === 'applied' ? { applied_at: new Date().toISOString() } : {}),
    }).eq('id', appId);
    await load(false);
  };

  const saveInterview = async (appId: string) => {
    setSavingInterview(true);
    await supabase.from('applications').update({
      status: 'interview',
      interview_date: interviewDate || null,
      interview_notes: interviewNotes || null,
    }).eq('id', appId);
    setSchedulingAppId(null);
    setSavingInterview(false);
    await load(false);
  };

  const downloadResume = async (pdfPath: string) => {
    const { data } = await supabase.storage.from('resumes').createSignedUrl(pdfPath, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const handleUploadResumeForCandidate = async (file: File) => {
    if (!candidate) return;
    setUploadError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('candidate_id', candidate.id);
    formData.append('label', uploadLabel.trim() || file.name.replace(/\.pdf$/i, ''));
    try {
      const res = await fetch('/api/candidate-resumes', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setShowUploadModal(false);
      setUploadLabel('');
      await load(false);
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (notAssigned) return (
    <div className="text-center py-20 space-y-3">
      <p className="text-surface-500 text-sm">This candidate is not assigned to you.</p>
      <button onClick={() => router.back()} className="btn-secondary text-sm">Go Back</button>
    </div>
  );
  if (!candidate) return <p className="text-surface-500 text-sm py-10 text-center">Candidate not found.</p>;

  const skills = safeArray(candidate.skills);
  const experience = safeArray(candidate.experience);
  const education = safeArray(candidate.education);

  return (
    <div className="space-y-6 min-w-0 max-w-full overflow-x-hidden">

      {/* ── HEADER ── */}
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap min-w-0">
        <button onClick={() => router.back()} className="btn-ghost p-2 shrink-0"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900 font-display truncate">{candidate.full_name}</h1>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', candidate.active ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-200' : 'bg-surface-100 dark:bg-surface-600 text-surface-500 dark:text-surface-400')}>
              {candidate.active ? 'Active' : 'Inactive'}
            </span>
            {candidate.rating > 0 && (
              <div className="flex gap-0.5">
                {Array.from({ length: candidate.rating }).map((_: any, i: number) => (
                  <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-surface-500">
            <span className="font-medium text-surface-700">{candidate.primary_title || <span className="italic text-surface-400">No title yet</span>}</span>
            {candidate.location && <span className="flex items-center gap-1"><MapPin size={12} />{candidate.location}</span>}
            {candidate.email && <a href={`mailto:${candidate.email}`} className="flex items-center gap-1 hover:text-brand-600"><Mail size={12} />{candidate.email}</a>}
            {candidate.phone && <a href={`tel:${candidate.phone}`} className="flex items-center gap-1 hover:text-brand-600"><Phone size={12} />{candidate.phone}</a>}
            {candidate.linkedin_url && <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-brand-600"><Linkedin size={12} />LinkedIn</a>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {autofillSuccess && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 size={13} /> Autofilled
            </span>
          )}
          <button
            type="button"
            onClick={handleAutofillWithAI}
            disabled={autofilling}
            className="btn-secondary text-xs sm:text-sm flex items-center gap-1.5"
            title="Use AI to autofill this candidate's profile from their resume"
          >
            {autofilling ? <Spinner size={13} /> : <Sparkles size={13} />} Autofill with AI
          </button>
          {!editingProfile && (
            <button onClick={() => setEditingProfile(true)} className="btn-secondary text-sm flex items-center gap-1.5">
              <Edit2 size={13} /> Edit Profile
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex items-center gap-2">
          <AlertCircle size={14} /> {saveError}
        </div>
      )}
      {autofillError && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertCircle size={14} /> {autofillError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Matches', value: matches.length, color: 'text-brand-600' },
          { label: 'Applications', value: applications.length, color: 'text-purple-600' },
          { label: 'Resumes', value: resumes.length + candidateResumes.length, color: 'text-amber-600' },
          { label: 'Top Score', value: matches[0]?.fit_score ?? '—', color: 'text-green-600' },
        ].map((s) => (
          <div key={s.label} className="card p-3 text-center">
            <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-surface-500">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs
        tabs={[
          { key: 'profile', label: editingProfile ? '✏️ Editing Profile' : 'Profile' },
          { key: 'matches', label: 'Matching Jobs', count: matches.length },
          { key: 'applications', label: 'Applications', count: applications.length },
          { key: 'resumes', label: 'Resumes', count: resumes.length + candidateResumes.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ── PROFILE TAB ── */}
      {tab === 'profile' && (
        editingProfile ? (
          <div className="space-y-6">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Basic Information</h3>
              <p className="text-xs text-surface-500 mb-3">Name, email and phone are set by the admin. You can edit all other fields below.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="label">Full Name <span className="text-surface-400 dark:text-surface-500 font-normal text-xs">set by admin</span></label><input value={profileForm.full_name} readOnly className="input text-sm bg-surface-50 dark:bg-surface-700 text-surface-500 dark:text-surface-300" /></div>
                <div><label className="label">Primary Title <span className="text-red-500">*</span></label><input value={profileForm.primary_title} onChange={(e) => set('primary_title', e.target.value)} className="input text-sm" placeholder="Data Analyst" /></div>
                <div><label className="label">Email <span className="text-surface-400 dark:text-surface-500 font-normal text-xs">set by admin</span></label><input value={profileForm.email} readOnly className="input text-sm bg-surface-50 dark:bg-surface-700 text-surface-500 dark:text-surface-300" type="email" /></div>
                <div><label className="label">Phone <span className="text-surface-400 dark:text-surface-500 font-normal text-xs">set by admin</span></label><input value={profileForm.phone} readOnly className="input text-sm bg-surface-50 dark:bg-surface-700 text-surface-500 dark:text-surface-300" type="tel" /></div>
                <div><label className="label">Location</label><input value={profileForm.location} onChange={(e) => set('location', e.target.value)} className="input text-sm" placeholder="New York, NY" /></div>
                <div><label className="label">LinkedIn URL</label><input value={profileForm.linkedin_url} onChange={(e) => set('linkedin_url', e.target.value)} className="input text-sm" /></div>
                <div><label className="label">GitHub URL</label><input value={profileForm.github_url} onChange={(e) => set('github_url', e.target.value)} className="input text-sm" /></div>
                <div><label className="label">Portfolio URL</label><input value={profileForm.portfolio_url} onChange={(e) => set('portfolio_url', e.target.value)} className="input text-sm" /></div>
                <div>
                  <label className="label">Visa / Work Auth</label>
                  <select value={profileForm.visa_status} onChange={(e) => set('visa_status', e.target.value)} className="input text-sm" aria-label="Visa status">
                    <option value="">— Select —</option>
                    {VISA_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div><label className="label">Citizenship</label><input value={profileForm.citizenship} onChange={(e) => set('citizenship', e.target.value)} className="input text-sm" placeholder="US, India..." /></div>
                <div className="col-span-2"><label className="label">Professional Summary</label><textarea value={profileForm.summary} onChange={(e) => set('summary', e.target.value)} className="input text-sm h-24 resize-none" /></div>
                <div className="col-span-2 flex items-center gap-3">
                  <button type="button" onClick={() => set('active', !profileForm.active)} className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0', profileForm.active ? 'bg-brand-600' : 'bg-surface-300')}>
                    <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', profileForm.active ? 'translate-x-5' : 'translate-x-0.5')} />
                  </button>
                  <span className="text-sm text-surface-700">{profileForm.active ? 'Active — visible in matching' : 'Inactive — excluded from matching'}</span>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Skills & Expertise</h3>
              <div className="space-y-4">
                <div><label className="label">Technical Skills <span className="text-xs text-surface-400 font-normal">press Enter to add</span></label><TagInput value={profileForm.skills} onChange={(v) => set('skills', v)} placeholder="Python, SQL, Tableau..." /></div>
                <div><label className="label">Tools & Software</label><TagInput value={profileForm.tools} onChange={(v) => set('tools', v)} placeholder="Excel, Power BI, Jira..." /></div>
                <div><label className="label">Soft Skills</label><TagInput value={profileForm.soft_skills} onChange={(v) => set('soft_skills', v)} placeholder="Communication, Leadership..." /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="label">Years of Experience</label><input value={profileForm.years_of_experience} onChange={(e) => set('years_of_experience', e.target.value)} className="input text-sm" type="number" min="0" max="50" /></div>
                  <div>
                    <label className="label">Highest Education</label>
                    <select value={profileForm.highest_education} onChange={(e) => set('highest_education', e.target.value)} className="input text-sm" aria-label="Education level">
                      <option value="">— Select —</option>
                      {EDUCATION_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Languages</label>
                  <div className="space-y-2">
                    {profileForm.languages.map((lang: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={lang.language} onChange={(e) => { const l = [...profileForm.languages]; l[i] = { ...l[i], language: e.target.value }; set('languages', l); }} className="input text-sm flex-1" placeholder="Language" />
                        <select value={lang.level} onChange={(e) => { const l = [...profileForm.languages]; l[i] = { ...l[i], level: e.target.value }; set('languages', l); }} className="input text-sm w-full sm:w-36" aria-label="Level">
                          {LANGUAGE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                        </select>
                        <button type="button" onClick={() => set('languages', profileForm.languages.filter((_: any, j: number) => j !== i))} className="btn-ghost p-1.5 text-red-400"><X size={14} /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => set('languages', [...profileForm.languages, { language: '', level: 'Conversational' }])} className="btn-ghost text-xs flex items-center gap-1 text-brand-600"><Plus size={12} />Add language</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Experience & Education</h3>
              <div className="space-y-4">
                {([
                  ['experience', 'Work Experience', 'h-44', '[{"company":"Acme","title":"Data Analyst","start_date":"2021-01","end_date":"","current":true,"location":"NYC","responsibilities":["Built dashboards"]}]'],
                  ['education', 'Education', 'h-28', '[{"institution":"University Name","degree":"BS","field":"Statistics","graduation_date":"2021-05"}]'],
                  ['certifications', 'Certifications', 'h-24', '[{"name":"Google Analytics","issuer":"Google","date":"2023-01"}]'],
                ] as const).map(([key, label, h, ph]) => (
                  <div key={key}>
                    <label className="label">{label} <span className="text-surface-400 text-xs font-normal">(JSON)</span></label>
                    <textarea value={profileForm[key]} onChange={(e) => set(key, e.target.value)} className={cn('input text-sm resize-none font-mono text-xs w-full', h)} placeholder={ph} />
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Preferences</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Availability</label>
                  <select value={profileForm.availability} onChange={(e) => set('availability', e.target.value)} className="input text-sm" aria-label="Availability">
                    <option value="">— Select —</option>
                    {AVAILABILITY_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div><label className="label">Notice Period</label><input value={profileForm.notice_period} onChange={(e) => set('notice_period', e.target.value)} className="input text-sm" placeholder="2 weeks" /></div>
                <div><label className="label">Salary Min (USD/yr)</label><input value={profileForm.salary_min} onChange={(e) => set('salary_min', e.target.value)} className="input text-sm" type="number" placeholder="80000" /></div>
                <div><label className="label">Salary Max (USD/yr)</label><input value={profileForm.salary_max} onChange={(e) => set('salary_max', e.target.value)} className="input text-sm" type="number" placeholder="120000" /></div>
                <div className="col-span-2 flex gap-6">
                  {([['open_to_remote', 'Open to remote'], ['open_to_relocation', 'Open to relocation']] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={profileForm[key]} onChange={(e) => set(key, e.target.checked)} className="rounded border-surface-300 text-brand-600 w-4 h-4" />
                      <span className="text-sm text-surface-700">{label}</span>
                    </label>
                  ))}
                </div>
                <div className="col-span-2"><label className="label">Target Roles</label><TagInput value={profileForm.target_roles} onChange={(v) => set('target_roles', v)} placeholder="Data Analyst, BI Developer..." /></div>
                <div className="col-span-2"><label className="label">Target Locations</label><TagInput value={profileForm.target_locations} onChange={(v) => set('target_locations', v)} placeholder="New York, Remote..." /></div>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Internal Notes</h3>
              <div className="space-y-4">
                <div>
                  <label className="label">Rating</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => set('rating', n === profileForm.rating ? 0 : n)}>
                        <Star size={18} className={cn(n <= profileForm.rating ? 'text-amber-400 fill-amber-400' : 'text-surface-300')} />
                      </button>
                    ))}
                  </div>
                </div>
                <div><label className="label">Internal Notes <span className="text-xs text-surface-400 font-normal">not visible to candidate</span></label><textarea value={profileForm.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} className="input text-sm h-20 resize-none" /></div>
                <div><label className="label">Interview Notes</label><textarea value={profileForm.interview_notes} onChange={(e) => set('interview_notes', e.target.value)} className="input text-sm h-20 resize-none" /></div>
              </div>
            </div>

            {/* Sticky save bar */}
            <div className="sticky bottom-4 z-10">
              <div className="card px-4 py-3 flex items-center gap-3 shadow-xl border border-surface-600 bg-surface-800">
                {saveError && (
                  <p className="text-xs text-red-600 flex items-center gap-1 flex-1 min-w-0">
                    <AlertCircle size={12} className="shrink-0" /><span className="truncate">{saveError}</span>
                  </p>
                )}
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <button onClick={cancelEdit} className="btn-secondary text-sm">Cancel</button>
                  <button onClick={saveProfile} disabled={saving || !profileForm.primary_title} className="btn-primary text-sm flex items-center gap-1.5 min-w-[120px] justify-center">
                    {saving ? <Spinner size={14} /> : <Save size={13} />}
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              {candidate.summary && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-surface-800 mb-2">Summary</h3>
                  <p className="text-sm text-surface-600 leading-relaxed">{candidate.summary}</p>
                </div>
              )}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800 mb-4">Experience</h3>
                {experience.length > 0 ? (
                  <div className="space-y-4">
                    {experience.map((exp: any, i: number) => (
                      <div key={i} className="border-l-2 border-brand-200 pl-4">
                        <p className="text-sm font-semibold text-surface-900">{exp.title}</p>
                        <p className="text-sm text-surface-600">{exp.company}{exp.location ? ` · ${exp.location}` : ''}</p>
                        <p className="text-xs text-surface-400 mt-0.5">{exp.start_date} — {exp.current ? 'Present' : exp.end_date}</p>
                        {safeArray(exp.responsibilities).slice(0, 3).map((r: string, j: number) => (
                          <p key={j} className="text-xs text-surface-500 mt-1 pl-2 before:content-['•'] before:mr-1">{r}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-surface-400 mb-3">No experience added yet</p>
                    <button onClick={() => setEditingProfile(true)} className="btn-primary text-xs flex items-center gap-1 mx-auto"><Edit2 size={12} /> Add Experience</button>
                  </div>
                )}
              </div>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800 mb-3">Education</h3>
                {education.length > 0 ? (
                  <div className="space-y-3">
                    {education.map((ed: any, i: number) => (
                      <div key={i}>
                        <p className="text-sm font-medium text-surface-800">{ed.degree} in {ed.field}</p>
                        <p className="text-sm text-surface-500">{ed.institution} · {ed.graduation_date}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-surface-400">No education added yet</p>}
              </div>
              {candidate.internal_notes && (
                <div className="card p-5 border-amber-100 bg-amber-50">
                  <h3 className="text-sm font-semibold text-surface-800 mb-2">Internal Notes</h3>
                  <p className="text-xs text-surface-700 leading-relaxed">{candidate.internal_notes}</p>
                </div>
              )}
            </div>
            <div className="space-y-5">
              <div className="card p-5 space-y-2">
                <h3 className="text-sm font-semibold text-surface-800 mb-3">Details</h3>
                {candidate.visa_status && <p className="text-xs text-surface-600">🛂 {candidate.visa_status}</p>}
                {candidate.availability && <p className="text-xs text-surface-600">📅 {candidate.availability}</p>}
                {candidate.salary_min && <p className="text-xs text-surface-600">💰 ${Math.round(candidate.salary_min / 1000)}k{candidate.salary_max ? `–$${Math.round(candidate.salary_max / 1000)}k` : '+'}</p>}
                {candidate.open_to_remote && <p className="text-xs text-surface-600">🌐 Open to remote</p>}
                {candidate.open_to_relocation && <p className="text-xs text-surface-600">✈️ Open to relocation</p>}
                {candidate.years_of_experience && <p className="text-xs text-surface-600">📊 {candidate.years_of_experience} years experience</p>}
              </div>
              {skills.length > 0 ? (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-surface-800 mb-3">Skills</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((s: string, i: number) => <span key={i} className="px-2 py-0.5 bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-200 rounded text-xs">{s}</span>)}
                  </div>
                </div>
              ) : (
                <div className="card p-5 text-center">
                  <p className="text-xs text-surface-400 mb-2">No skills added yet</p>
                  <button onClick={() => setEditingProfile(true)} className="btn-primary text-xs flex items-center gap-1 mx-auto"><Edit2 size={12} /> Add Skills</button>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* ── MATCHES TAB ── */}
      {tab === 'matches' && (
        <div className="space-y-3">
          {/* Legend */}
          <div className="flex items-center gap-4 px-1 text-xs text-surface-400">
            <span className="flex items-center gap-1.5"><Send size={11} className="text-brand-500" /> Apply Now — opens job site</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-green-500" /> Confirm Applied — records application</span>
          </div>

          {resumeError && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/25 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{resumeError}</span>
              <button type="button" onClick={() => setResumeError(null)} className="ml-auto text-amber-600 hover:text-amber-800 p-1" aria-label="Dismiss">✕</button>
            </div>
          )}

          {matches.length === 0 ? (
            <EmptyState icon={<Briefcase size={24} />} title="No matches yet" description="The matching engine hasn't run for this candidate yet" />
          ) : matches.map((m) => {
            const existingApp = applications.find(a => a.job_id === m.job_id);
            const isPending = pendingApply === m.job_id;
            const isConfirming = confirmingApply === m.job_id;

            return (
              <div key={m.id} className={cn('card p-4 transition-all', isPending && 'ring-2 ring-amber-300 border-amber-200 bg-amber-50/30')}>
                <div className="flex items-start gap-4">

                  {/* ATS score badge */}
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    <span className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold', scoreColor(m.fit_score))}>
                      {m.fit_score}
                    </span>
                    {typeof (m as any).ats_score === 'number' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 font-semibold">
                        ATS {(m as any).ats_score}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Job info + action row */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-surface-900 dark:text-surface-100">{m.job?.title}</p>
                        <p className="text-sm text-surface-500 dark:text-surface-400">{m.job?.company} · {m.job?.location || 'Location not listed'}</p>
                        {(m.job?.jd_clean || m.job?.jd_raw) && (
                          <button
                            type="button"
                            onClick={() => setViewingJdJob({ title: m.job?.title || 'Job', company: m.job?.company || '', jd: (m.job?.jd_clean || m.job?.jd_raw || '').slice(0, 15000) })}
                            className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-0.5"
                          >
                            View job description
                          </button>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        <button onClick={() => generateEmail(m.job_id)} className="btn-ghost text-xs flex items-center gap-1 py-1.5 px-2.5 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10">
                          <Mail size={12} /> Email
                        </button>
                        <button onClick={() => generateBrief(m.job_id)} className="btn-ghost text-xs flex items-center gap-1 py-1.5 px-2.5 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10">
                          <Brain size={12} /> Brief
                        </button>
                        {(() => {
                          const canGenerate = resumeGenerationAllowed && (m.fit_score ?? 0) < 75;
                          const whyDisabled = !resumeGenerationAllowed ? 'Ask an admin to grant resume generation access' : (m.fit_score ?? 0) >= 75 ? 'Only available for matches with score below 75' : '';
                          return (
                            <button
                              onClick={() => generateResume(m.job_id)}
                              disabled={generating === m.job_id || !canGenerate}
                              title={whyDisabled || undefined}
                              className={cn('text-xs py-1.5 px-3 flex items-center gap-1', canGenerate ? 'btn-primary' : 'btn-secondary opacity-70 cursor-not-allowed')}
                            >
                              {generating === m.job_id ? <Spinner size={12} /> : <Sparkles size={12} />} Resume
                            </button>
                          );
                        })()}

                        {(() => {
                          const selectedResumeId =
                            selectedAtsResumeByJob[m.job_id] ||
                            m.best_resume_id ||
                            candidateResumes?.[0]?.id ||
                            '';
                          const running = !!atsRunningByJob[m.job_id];
                          return (
                            <>
                              {candidateResumes?.length > 0 && (
                                <select
                                  value={selectedResumeId}
                                  onChange={(e) => setSelectedAtsResumeByJob(p => ({ ...p, [m.job_id]: e.target.value }))}
                                  className="input text-xs py-1.5 px-2 w-36"
                                  title="Select resume for ATS check"
                                >
                                  {candidateResumes.map((r: any) => (
                                    <option key={r.id} value={r.id}>{r.label || r.file_name || 'Resume'}</option>
                                  ))}
                                </select>
                              )}
                              <button
                                onClick={() => runAtsForJob(m.job_id, selectedResumeId || null)}
                                disabled={running}
                                className={cn('btn-secondary text-xs py-1.5 px-3 flex items-center gap-1', running && 'opacity-70 cursor-not-allowed')}
                                title="Run full 8-dimensional ATS scoring with resume (uses AI tokens)."
                              >
                                {running ? <Spinner size={12} /> : <Brain size={12} />} ATS
                              </button>
                            </>
                          );
                        })()}

                        {/* ── Application state machine ── */}
                        {existingApp ? (
                          // Already confirmed applied
                          <span className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-200 font-semibold px-2.5 py-1.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-500/40 rounded-lg">
                            <CheckCircle2 size={13} className="shrink-0" />
                            Applied · <span className="capitalize">{existingApp.status}</span>
                          </span>
                        ) : isPending ? (
                          // Waiting for recruiter to confirm they submitted
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setPendingApply(null)} className="btn-ghost text-xs p-1.5 text-surface-400 hover:text-surface-600" title="Cancel">
                              <X size={13} />
                            </button>
                            <button
                              onClick={() => confirmApplied(m.job_id)}
                              disabled={isConfirming}
                              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-60"
                            >
                              {isConfirming ? <Spinner size={12} /> : <CheckCircle2 size={13} />}
                              Confirm Applied
                            </button>
                          </div>
                        ) : (
                          // Default — step 1
                          <button
                            onClick={() => handleApplyNow(m.job_id, m.job?.url ?? null)}
                            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                          >
                            <Send size={12} /> Apply Now
                          </button>
                        )}
                      </div>
                    </div>

                    {(atsErrorByJob[m.job_id] || '').trim() && (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                        {atsErrorByJob[m.job_id]}
                      </p>
                    )}

                    {/* Pending confirmation banner */}
                    {isPending && (
                      <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/25 border border-amber-200 dark:border-amber-500/40 rounded-lg">
                        <span className="text-base shrink-0">⚠️</span>
                        <p className="text-xs text-amber-800">
                          <span className="font-semibold">Job opened in a new tab.</span> Complete the application there, then come back and click <span className="font-semibold text-green-700">Confirm Applied</span> to record it here.
                        </p>
                      </div>
                    )}

                    {/* Keyword pills */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {safeArray(m.matched_keywords).slice(0, 5).map((k: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-200 rounded text-[11px]">✓ {k}</span>
                      ))}
                      {safeArray(m.missing_keywords).slice(0, 3).map((k: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 rounded text-[11px]">✗ {k}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Brief panel */}
                {briefJobId === m.job_id && (
                  <div className="mt-4 pt-4 border-t border-surface-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain size={14} className="text-brand-600" />
                      <p className="text-xs font-semibold text-brand-700">Pre-Call Brief</p>
                      <button onClick={() => setBriefJobId(null)} className="ml-auto text-xs text-surface-400">✕</button>
                    </div>
                    {briefLoading
                      ? <div className="flex items-center gap-2 text-xs text-surface-500 py-3"><Spinner size={14} /> Generating…</div>
                      : <div className="text-xs text-surface-700 dark:text-surface-200 leading-relaxed whitespace-pre-wrap bg-surface-50 dark:bg-surface-700 rounded-lg p-4">{brief}</div>
                    }
                  </div>
                )}

                {/* Email panel */}
                {emailJobId === m.job_id && (
                  <div className="mt-4 pt-4 border-t border-surface-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Mail size={14} className="text-purple-600" />
                      <p className="text-xs font-semibold text-purple-700">Outreach Email</p>
                      <button onClick={() => setEmailJobId(null)} className="ml-auto text-xs text-surface-400">✕</button>
                    </div>
                    {emailLoading
                      ? <div className="flex items-center gap-2 text-xs text-surface-500 py-3"><Spinner size={14} /> Drafting…</div>
                      : (
                        <div className="space-y-2">
                          <div className="bg-surface-50 dark:bg-surface-700 rounded-lg p-4 text-xs text-surface-700 dark:text-surface-200 leading-relaxed whitespace-pre-wrap">{emailDraft}</div>
                          <button onClick={() => { navigator.clipboard.writeText(emailDraft || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="btn-ghost text-xs flex items-center gap-1.5">
                            {copied ? <><Check size={12} className="text-green-500" /> Copied!</> : <><Copy size={12} /> Copy</>}
                          </button>
                        </div>
                      )
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── APPLICATIONS TAB ── */}
      {tab === 'applications' && (
        <div className="space-y-3">
          {applications.length === 0
            ? <EmptyState icon={<FileText size={24} />} title="No applications yet" description="Click Apply Now on a matched job, then confirm applied to record it" />
            : applications.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold text-surface-900">{a.job?.title}</p>
                    <p className="text-sm text-surface-500">{a.job?.company} · {a.job?.location || '—'}</p>
                    <p className="text-xs text-surface-400 mt-0.5">Applied {a.applied_at ? formatDate(a.applied_at) : '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={a.status} />
                    <select value={a.status} onChange={(e) => updateStatus(a.id, e.target.value)} className="input text-xs py-1 px-2 w-full sm:w-32" aria-label="Update status">
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {a.job?.url && (
                      <a href={a.job.url} target="_blank" rel="noopener noreferrer" className="btn-ghost p-1.5" title="View job posting">
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>

                {a.status === 'interview' && (
                  <div className="mt-3 pt-3 border-t border-surface-100">
                    {schedulingAppId === a.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input type="datetime-local" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} className="input text-xs py-1 flex-1" />
                          <button onClick={() => saveInterview(a.id)} disabled={savingInterview} className="btn-primary text-xs px-3 py-1">
                            {savingInterview ? <Spinner size={12} /> : 'Save'}
                          </button>
                          <button onClick={() => setSchedulingAppId(null)} className="btn-ghost text-xs px-2">✕</button>
                        </div>
                        <textarea value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)} placeholder="Notes…" className="input text-xs h-16 resize-none w-full" />
                      </div>
                    ) : (
                      <button
                        onClick={() => { setSchedulingAppId(a.id); setInterviewDate(a.interview_date?.slice(0, 16) || ''); setInterviewNotes(a.interview_notes || a.notes || ''); }}
                        className="btn-ghost text-xs flex items-center gap-1.5 text-purple-600"
                      >
                        <Calendar size={12} />
                        {a.interview_date ? `Interview: ${formatDate(a.interview_date)} — Edit` : '+ Schedule interview'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* ── RESUMES TAB ── */}
      {tab === 'resumes' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-surface-500">
              You can upload up to {MAX_RESUMES_PER_CANDIDATE} resumes for this candidate.
            </p>
            {candidateResumes.length < MAX_RESUMES_PER_CANDIDATE && (
              <button
                onClick={() => { setUploadError(null); setUploadLabel(''); setShowUploadModal(true); }}
                className="btn-primary text-xs sm:text-sm flex items-center gap-2 py-2 px-3 sm:px-4"
              >
                <Upload size={14} /> Upload resume
              </button>
            )}
          </div>

          {candidateResumes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-surface-700 mb-3">Uploaded by Candidate ({candidateResumes.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {candidateResumes.map((r) => (
                  <div key={r.id} className="card p-5 border-brand-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0"><FileText size={16} className="text-red-500 dark:text-red-400" /></div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-surface-900 truncate">{r.label}</p>
                          <p className="text-xs text-surface-400 truncate">{r.file_name}</p>
                          <p className="text-xs text-surface-400">{formatRelative(r.uploaded_at)}</p>
                        </div>
                      </div>
                      <button onClick={() => downloadResume(r.pdf_path)} className="btn-ghost p-1.5 shrink-0" title="Download"><Download size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-surface-700 mb-3">AI-Generated Resumes ({resumes.length})</h3>
            {resumes.length === 0 && candidateResumes.length === 0 ? (
              <EmptyState icon={<FileText size={24} />} title="No resumes yet" description="Generate one from the Matching Jobs tab, or upload a resume for the candidate." />
            ) : resumes.length === 0 ? (
              <p className="text-sm text-surface-400 italic">No AI-generated resumes yet. Generate one from the Matching Jobs tab.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {resumes.map((r) => (
                  <div key={r.id} className="card p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-surface-900">{r.job?.title}</p>
                        <p className="text-xs text-surface-500">{r.job?.company} · v{r.version_number}</p>
                      </div>
                      <StatusBadge status={r.generation_status} />
                    </div>
                    <p className="text-xs text-surface-400 mt-2">{formatRelative(r.created_at)}</p>
                    {r.generation_status === 'completed' && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => downloadResume(r.pdf_path)} className="btn-secondary text-xs py-1.5 flex items-center gap-1"><Download size={13} /> Download</button>
                        <button onClick={() => markApplied(r.job_id, r.id)} className="btn-primary text-xs py-1.5 flex items-center gap-1"><CheckCircle2 size={13} /> Mark Applied</button>
                      </div>
                    )}
                    {r.generation_status === 'failed' && r.error_message && (
                      <p className="text-xs text-red-500 mt-2">{r.error_message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Resume Modal (recruiter uploading for candidate) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl border border-surface-200 dark:border-surface-600 w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100 font-display">
                Upload resume for candidate
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 dark:text-surface-400"
              >
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="label dark:text-surface-200">
                Label{' '}
                <span className="text-surface-400 dark:text-surface-500 font-normal text-xs">
                  e.g. General, Senior SWE v2
                </span>
              </label>
              <input
                className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                value={uploadLabel}
                onChange={e => setUploadLabel(e.target.value)}
                placeholder="General Resume"
              />
            </div>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Spinner size={22} />
                  <p className="text-sm text-surface-500 dark:text-surface-400">Uploading...</p>
                </div>
              ) : (
                <>
                  <Upload size={28} className="mx-auto text-surface-400 dark:text-surface-500 mb-2" />
                  <p className="text-sm font-medium text-surface-700 dark:text-surface-200">Click to select PDF</p>
                  <p className="text-xs text-surface-400 dark:text-surface-500 mt-1">PDF only · max 10MB</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadResumeForCandidate(f);
                }}
              />
            </div>
            {uploadError && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle size={12} />
                {uploadError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Job description modal */}
      {viewingJdJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setViewingJdJob(null)}>
          <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-surface-200 dark:border-surface-600" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-surface-200 dark:border-surface-600 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-surface-900 dark:text-surface-100">{viewingJdJob.title}</h3>
                <p className="text-sm text-surface-500 dark:text-surface-400">{viewingJdJob.company}</p>
              </div>
              <button type="button" onClick={() => setViewingJdJob(null)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 text-sm text-surface-700 dark:text-surface-200 whitespace-pre-wrap">{viewingJdJob.jd || 'No description available.'}</div>
          </div>
        </div>
      )}

    </div>
  );
}