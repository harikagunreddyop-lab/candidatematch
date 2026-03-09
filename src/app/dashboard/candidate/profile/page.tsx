'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Spinner, ToastContainer } from '@/components/ui';
import { useFeatureFlags, useToast } from '@/hooks';
import {
  profileCompletionPercent,
  profileStrengthScore,
  profileCompletionChecklist,
} from '@/lib/profile-completion';
import { validateProfileForm } from '@/lib/validation/schemas';
import {
  ProfileCompletionWidget,
  ProfilePreviewModal,
  PrivacyControlsPanel,
  SkillsAutocomplete,
  AIProfileOptimizer,
  LinkedInSyncButton,
  RichExperienceEditor,
} from '@/components/candidate/profile';
import type { PrivacySettings } from '@/components/candidate/profile';
import type { Experience } from '@/types';
import { FileDown, Mail, Phone, MapPin, Linkedin, AlertCircle, Sparkles, BarChart2, Eye } from 'lucide-react';

function normalizeExperience(raw: unknown): Experience[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e: any) => ({
    company: e?.company ?? '',
    title: e?.title ?? '',
    start_date: e?.start_date ?? '',
    end_date: e?.end_date ?? '',
    current: Boolean(e?.current),
    responsibilities: Array.isArray(e?.responsibilities) ? e.responsibilities : [],
    location: e?.location,
  }));
}

export default function CandidateProfilePage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const { flags } = useFeatureFlags();
  const { toasts, toast, dismiss } = useToast();
  const atsReportAllowed = flags.candidate_see_ats_fix_report !== false;
  const exportAllowed = flags.candidate_export_data !== false;
  const [candidate, setCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<any>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [autofilling, setAutofilling] = useState(false);
  const [autofillError, setAutofillError] = useState<string | null>(null);
  const [autofillSuccess, setAutofillSuccess] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DEBOUNCE_MS = 2000;

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data: cand } = await supabase.from('candidates').select('*').eq('user_id', session.user.id).single();
    if (!cand) {
      // #region agent log
      fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'candidate-audit-1',hypothesisId:'H4',location:'profile/page.tsx:68',message:'Candidate profile page has no linked candidate',data:{hasSession:true},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setNotLinked(true); setLoading(false); return;
    }
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'candidate-audit-1',hypothesisId:'H1',location:'profile/page.tsx:72',message:'Loaded candidate target title fields',data:{candidateId:cand.id,targetJobTitlesCount:Array.isArray(cand.target_job_titles)?cand.target_job_titles.length:0,targetRolesCount:Array.isArray((cand as any).target_roles)?(cand as any).target_roles.length:0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const normalizedTargetTitles =
      Array.isArray(cand.target_job_titles) && cand.target_job_titles.length > 0
        ? cand.target_job_titles
        : (Array.isArray((cand as any).target_roles) ? (cand as any).target_roles : []);
    setCandidate({ ...cand, target_job_titles: normalizedTargetTitles });
    setAutofillSuccess(false);
    setProfileForm({
      full_name: cand.full_name || '',
      primary_title: cand.primary_title || '',
      target_job_titles: normalizedTargetTitles.join(', '),
      phone: cand.phone || '',
      location: cand.location || '',
      linkedin_url: cand.linkedin_url || '',
      portfolio_url: cand.portfolio_url || '',
      summary: cand.summary || '',
      default_pitch: cand.default_pitch || '',
      salary_min: cand.salary_min ?? '',
      salary_max: cand.salary_max ?? '',
      availability: cand.availability || '',
      open_to_remote: cand.open_to_remote ?? true,
      skills: Array.isArray(cand.skills) ? [...cand.skills] : [],
      experience: normalizeExperience(cand.experience),
    });
    setPrivacySettings((cand.privacy_settings as PrivacySettings) || {});
    setFieldErrors({});
    setLoading(false);
  };

  const runValidation = useCallback(() => {
    const errors = validateProfileForm(profileForm);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [profileForm]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  useEffect(() => {
    const linkedin = searchParams.get('linkedin');
    const linkedinError = searchParams.get('linkedin_error');
    if (linkedin === 'success') {
      toast('Profile updated from LinkedIn', 'success');
      load();
      window.history.replaceState({}, '', '/dashboard/candidate/profile');
    } else if (linkedinError) {
      const messages: Record<string, string> = {
        config: 'LinkedIn is not configured.',
        cancelled: 'LinkedIn import was cancelled.',
        auth: 'LinkedIn authorization failed.',
        session: 'Session invalid. Please sign in again.',
        exchange: 'Could not complete LinkedIn sign-in.',
        fetch: 'Could not load your LinkedIn profile.',
        no_candidate: 'No candidate profile found.',
        save: 'Could not save profile.',
      };
      toast(messages[linkedinError] || 'LinkedIn import failed', 'error');
      window.history.replaceState({}, '', '/dashboard/candidate/profile');
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced auto-save when editing
  useEffect(() => {
    if (!editingProfile || !candidate) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      const errors = validateProfileForm(profileForm);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});
      saveProfile(false);
    }, DEBOUNCE_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [editingProfile, profileForm, privacySettings, candidate?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- saveProfile stable enough

  const handleAutofillWithAI = async () => {
    setAutofillError(null);
    setAutofillSuccess(false);
    setAutofilling(true);
    try {
      const res = await fetch('/api/profile/ai-fill', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAutofillError(data.error || 'Autofill failed');
        return;
      }
      setAutofillSuccess(true);
      await load();
      setProfileForm((prev: any) => ({
        ...prev,
        ...(data.candidate && {
          full_name: data.candidate.full_name ?? prev.full_name,
          primary_title: data.candidate.primary_title ?? prev.primary_title,
          phone: data.candidate.phone ?? prev.phone,
          location: data.candidate.location ?? prev.location,
          linkedin_url: data.candidate.linkedin_url ?? prev.linkedin_url,
          portfolio_url: data.candidate.portfolio_url ?? prev.portfolio_url,
          summary: data.candidate.summary ?? prev.summary,
          default_pitch: data.candidate.default_pitch ?? prev.default_pitch,
        }),
      }));
    } finally {
      setAutofilling(false);
    }
  };

  const handleExportData = async () => {
    const res = await fetch('/api/candidate-export');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast((data as any).error || 'Export failed', 'error');
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orion-candidate-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Data exported', 'success');
  };

  const saveProfile = useCallback(async (exitEdit = true) => {
    if (!candidate) return;
    if (!runValidation()) return;
    setSavingProfile(true);
    setProfileError(null);
    const targetTitlesArr = (profileForm.target_job_titles || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);
    const payload: Record<string, unknown> = {
      full_name: profileForm.full_name,
      primary_title: profileForm.primary_title?.trim() || null,
      target_job_titles: targetTitlesArr,
      target_roles: targetTitlesArr,
      phone: profileForm.phone || null,
      location: profileForm.location || null,
      linkedin_url: profileForm.linkedin_url || null,
      portfolio_url: profileForm.portfolio_url || null,
      summary: profileForm.summary || null,
      default_pitch: profileForm.default_pitch?.trim() || null,
      salary_min: profileForm.salary_min !== '' && profileForm.salary_min != null ? Number(profileForm.salary_min) : null,
      salary_max: profileForm.salary_max !== '' && profileForm.salary_max != null ? Number(profileForm.salary_max) : null,
      availability: profileForm.availability?.trim() || null,
      open_to_remote: profileForm.open_to_remote ?? true,
      privacy_settings: Object.keys(privacySettings).length ? privacySettings : {},
    };
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'candidate-audit-1',hypothesisId:'H1',location:'profile/page.tsx:216',message:'Saving candidate profile target_job_titles',data:{candidateId:candidate.id,targetJobTitlesCount:targetTitlesArr.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (Array.isArray(profileForm.experience) && profileForm.experience.length > 0) {
      (payload as any).experience = profileForm.experience;
    }
    const candidateForCompletion = { ...candidate, ...payload, skills: profileForm.skills ?? candidate.skills };
    (payload as any).profile_completion_percentage = profileCompletionPercent(candidateForCompletion as Record<string, unknown>);
    (payload as any).profile_strength_score = profileStrengthScore(candidateForCompletion as Record<string, unknown>);
    if (Array.isArray(profileForm.skills)) (payload as any).skills = profileForm.skills;

    const { error } = await supabase.from('candidates').update(payload).eq('id', candidate.id);
    if (error) {
      setProfileError(error.message);
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase.from('profiles').update({ name: profileForm.full_name?.trim() || '', updated_at: new Date().toISOString() }).eq('id', session.user.id);
      }
      if (exitEdit) setEditingProfile(false);
      await load();
    }
    setSavingProfile(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load/supabase stable; exitEdit and runValidation used intentionally
  }, [candidate, profileForm, privacySettings, runValidation]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (notLinked) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center px-4">
      <p className="text-sm text-surface-500 dark:text-surface-300">Your account isn&apos;t linked to a candidate profile yet. Contact your recruiter.</p>
    </div>
  );

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100 font-display">My Profile</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {atsReportAllowed && (
            <Link
              href="/dashboard/candidate/skills/gap-analysis"
              className="btn-secondary text-sm py-2 px-4 flex items-center gap-2"
              title="View ATS fix report and run on-demand ATS checks"
            >
              <BarChart2 size={14} /> ATS check
            </Link>
          )}
          <button
            onClick={handleAutofillWithAI}
            disabled={autofilling}
            className="btn-secondary text-sm py-2 px-4 flex items-center gap-2"
            title="Extract and fill your profile from your resume using AI"
          >
            {autofilling ? <Spinner size={14} /> : <Sparkles size={14} />}
            Autofill with AI
          </button>
          {exportAllowed && (
            <button onClick={handleExportData} className="btn-ghost text-sm py-2 px-4 flex items-center gap-2" title="Download your data as JSON">
              <FileDown size={14} /> Export my data
            </button>
          )}
          {!editingProfile
            ? <button onClick={() => setEditingProfile(true)} className="btn-secondary text-sm py-2 px-4">Edit profile</button>
            : <div className="flex gap-2">
                <button onClick={() => { setEditingProfile(false); setFieldErrors({}); }} className="btn-ghost text-sm">Cancel</button>
                <button onClick={() => saveProfile(true)} disabled={savingProfile} className="btn-primary text-sm min-w-[110px] py-2 px-4">
                  {savingProfile ? <Spinner size={14} /> : 'Save changes'}
                </button>
              </div>
          }
        </div>
      </div>

      {profileError && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex items-center gap-2">
          <AlertCircle size={14} /> {profileError}
        </div>
      )}
      {autofillError && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertCircle size={14} /> {autofillError}
        </div>
      )}
      {autofillSuccess && (
        <div className="rounded-xl border border-green-200 dark:border-green-500/40 bg-green-50 dark:bg-green-900/30 px-4 py-3 text-sm text-green-800 dark:text-green-200">
          Profile filled from your resume. Review below and edit if needed, then save.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Job title / Role</h3>
            {editingProfile
              ? (
                <input
                  type="text"
                  value={profileForm.primary_title || ''}
                  onChange={e => setProfileForm((p: any) => ({ ...p, primary_title: e.target.value }))}
                  className="input text-sm w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                  placeholder="e.g. Software Engineer, Data Analyst"
                />
              )
              : <p className="text-sm text-surface-600 dark:text-surface-300">{candidate.primary_title?.trim() || <span className="text-surface-400 dark:text-surface-500 italic">Not set — add in edit mode</span>}</p>
            }
          </div>

          <div className="rounded-2xl border border-brand-200 dark:border-brand-500/40 bg-surface-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-1">Target job titles</h3>
            <p className="text-xs text-surface-500 dark:text-surface-400 mb-3">Jobs matching these titles will appear in your My Jobs. Separate with commas.</p>
            {editingProfile
              ? (
                <input
                  type="text"
                  value={profileForm.target_job_titles || ''}
                  onChange={e => setProfileForm((p: any) => ({ ...p, target_job_titles: e.target.value }))}
                  className="input text-sm w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                  placeholder="e.g. Software Engineer, Backend Developer, Full Stack Engineer"
                />
              )
              : (
                <div className="flex flex-wrap gap-2">
                  {(candidate.target_job_titles as string[] | undefined)?.length
                    ? (candidate.target_job_titles as string[]).map((t, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-brand-500/10 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 text-xs font-medium">{t}</span>
                      ))
                    : <span className="text-surface-400 dark:text-surface-500 italic text-sm">None set — add titles to get matched to jobs</span>
                  }
                </div>
              )
            }
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Professional summary</h3>
            {editingProfile
              ? (
                <>
                  <textarea value={profileForm.summary} onChange={e => setProfileForm((p: any) => ({ ...p, summary: e.target.value }))}
                    className="input text-sm h-28 resize-none w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                    placeholder="Brief overview of your background and goals..." />
                  <AIProfileOptimizer
                    section="summary"
                    content={profileForm.summary || ''}
                    onApplySuggestion={(s) => setProfileForm((p: any) => ({ ...p, summary: s }))}
                    disabled={!profileForm.summary}
                    className="mt-3"
                  />
                </>
              )
              : <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed">{candidate.summary || <span className="text-surface-400 dark:text-surface-500 italic">No summary added</span>}</p>
            }
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Default pitch / cover snippet</h3>
            <p className="text-xs text-surface-500 dark:text-surface-400 mb-2">One paragraph for recruiters (e.g. elevator pitch or default cover intro).</p>
            {editingProfile
              ? <textarea value={profileForm.default_pitch || ''} onChange={e => setProfileForm((p: any) => ({ ...p, default_pitch: e.target.value }))}
                  className="input text-sm h-24 resize-none w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                  placeholder="e.g. Senior engineer with 8+ years in distributed systems..." />
              : <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed">{candidate.default_pitch || <span className="text-surface-400 dark:text-surface-500 italic">Not set</span>}</p>
            }
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-4">Preferences</h3>
            {editingProfile ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs dark:text-surface-200">Salary min (USD)</label>
                    <input
                      type="number"
                      min={0}
                      value={profileForm.salary_min ?? ''}
                      onChange={e => setProfileForm((p: any) => ({ ...p, salary_min: e.target.value }))}
                      onBlur={() => runValidation()}
                      aria-invalid={!!fieldErrors.salary_min}
                      aria-describedby={fieldErrors.salary_min ? 'err-salary_min' : undefined}
                      className={`input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 ${fieldErrors.salary_min ? 'border-red-500 dark:border-red-400' : ''}`}
                      placeholder="e.g. 120000"
                    />
                    {fieldErrors.salary_min && <p id="err-salary_min" className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">{fieldErrors.salary_min}</p>}
                  </div>
                  <div>
                    <label className="label text-xs dark:text-surface-200">Salary max (USD)</label>
                    <input
                      type="number"
                      min={0}
                      value={profileForm.salary_max ?? ''}
                      onChange={e => setProfileForm((p: any) => ({ ...p, salary_max: e.target.value }))}
                      onBlur={() => runValidation()}
                      aria-invalid={!!fieldErrors.salary_max}
                      aria-describedby={fieldErrors.salary_max ? 'err-salary_max' : undefined}
                      className={`input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 ${fieldErrors.salary_max ? 'border-red-500 dark:border-red-400' : ''}`}
                      placeholder="e.g. 180000"
                    />
                    {fieldErrors.salary_max && <p id="err-salary_max" className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">{fieldErrors.salary_max}</p>}
                  </div>
                </div>
                <div>
                  <label className="label text-xs dark:text-surface-200">Availability</label>
                  <input type="text" value={profileForm.availability || ''} onChange={e => setProfileForm((p: any) => ({ ...p, availability: e.target.value }))} className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100" placeholder="e.g. 2 weeks, Immediate" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={profileForm.open_to_remote ?? true} onChange={e => setProfileForm((p: any) => ({ ...p, open_to_remote: e.target.checked }))} className="rounded border-surface-300 dark:border-surface-600 text-brand-600" />
                  <span className="text-sm text-surface-700 dark:text-surface-200">Open to remote</span>
                </label>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-surface-600 dark:text-surface-300">
                {(candidate.salary_min != null || candidate.salary_max != null) && (
                  <p>Salary: {candidate.salary_min != null ? `$${candidate.salary_min.toLocaleString()}` : '—'} – {candidate.salary_max != null ? `$${candidate.salary_max.toLocaleString()}` : '—'}</p>
                )}
                {candidate.availability && <p>Availability: {candidate.availability}</p>}
                <p>Open to remote: {candidate.open_to_remote !== false ? 'Yes' : 'No'}</p>
                {!candidate.salary_min && !candidate.salary_max && !candidate.availability && candidate.open_to_remote === undefined && <p className="text-surface-400 dark:text-surface-500 italic">Not set</p>}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-4">Experience</h3>
            {editingProfile ? (
              <RichExperienceEditor
                value={profileForm.experience ?? []}
                onChange={(experience) => setProfileForm((p: any) => ({ ...p, experience }))}
              />
            ) : (Array.isArray(candidate.experience) ? candidate.experience : [])?.length > 0 ? (
              <div className="space-y-4">
                {(Array.isArray(candidate.experience) ? candidate.experience : []).map((exp: any, i: number) => (
                  <div key={i} className="border-l-2 border-brand-300 dark:border-brand-500/50 pl-4">
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">{exp.title}</p>
                    <p className="text-sm text-surface-600 dark:text-surface-300">{exp.company}</p>
                    <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">{exp.start_date} — {exp.current ? 'Present' : exp.end_date}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-surface-400 dark:text-surface-500">No experience on file. Add entries in edit mode.</p>}
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Education</h3>
            {(Array.isArray(candidate.education) ? candidate.education : [])?.length > 0 ? (
              <div className="space-y-3">
                {(Array.isArray(candidate.education) ? candidate.education : []).map((ed: any, i: number) => (
                  <div key={i}>
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-100">{ed.degree} in {ed.field}</p>
                    <p className="text-sm text-surface-500 dark:text-surface-400">{ed.institution} · {ed.graduation_date}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-surface-400 dark:text-surface-500">No education on file.</p>}
          </div>
        </div>

        <div className="space-y-5">
          <ProfileCompletionWidget
            completionPercent={profileCompletionPercent(candidate as Record<string, unknown>)}
            strengthScore={candidate.profile_strength_score ?? profileStrengthScore(candidate as Record<string, unknown>)}
            checklist={profileCompletionChecklist(candidate as Record<string, unknown>)}
            onSectionClick={() => setEditingProfile(true)}
          />
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 text-sm font-medium text-surface-700 dark:text-surface-200 hover:bg-surface-200 dark:hover:bg-surface-700"
          >
            <Eye className="w-4 h-4" /> Preview as recruiters see
          </button>
          <PrivacyControlsPanel
            settings={privacySettings}
            onChange={setPrivacySettings}
            disabled={!editingProfile}
          />
          <LinkedInSyncButton
            lastSyncedAt={candidate.linkedin_last_synced_at ?? null}
            linkedinSyncEnabled={candidate.linkedin_sync_enabled ?? false}
          />
          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Contact info</h3>
            {editingProfile ? (
              <div className="space-y-3">
                {(['full_name', 'phone', 'location', 'linkedin_url', 'portfolio_url'] as const).map(key => (
                  <div key={key}>
                    <label className="label text-xs dark:text-surface-200">{key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</label>
                    <input
                      type={key === 'linkedin_url' || key === 'portfolio_url' ? 'url' : key === 'phone' ? 'tel' : 'text'}
                      value={profileForm[key] || ''}
                      onChange={e => setProfileForm((p: any) => ({ ...p, [key]: e.target.value }))}
                      onBlur={() => runValidation()}
                      aria-invalid={!!fieldErrors[key]}
                      aria-describedby={fieldErrors[key] ? `err-${key}` : undefined}
                      className={`input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400 w-full ${fieldErrors[key] ? 'border-red-500 dark:border-red-400' : ''}`}
                    />
                    {fieldErrors[key] && <p id={`err-${key}`} className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">{fieldErrors[key]}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2 text-sm text-surface-600 dark:text-surface-300">
                {candidate.email && <p className="flex items-center gap-2"><Mail size={13} className="text-surface-400 dark:text-surface-500" />{candidate.email}</p>}
                {candidate.phone && <p className="flex items-center gap-2"><Phone size={13} className="text-surface-400 dark:text-surface-500" />{candidate.phone}</p>}
                {candidate.location && <p className="flex items-center gap-2"><MapPin size={13} className="text-surface-400 dark:text-surface-500" />{candidate.location}</p>}
                {candidate.linkedin_url && (
                  <a href={candidate.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-brand-600 dark:text-brand-400 hover:underline">
                    <Linkedin size={13} />LinkedIn profile
                  </a>
                )}
                {!candidate.email && !candidate.phone && !candidate.location && !candidate.linkedin_url && <p className="text-surface-400 dark:text-surface-500 italic text-xs">No contact info on file</p>}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Skills</h3>
            {editingProfile ? (
              <SkillsAutocomplete
                value={profileForm.skills ?? []}
                onChange={(skills) => setProfileForm((p: any) => ({ ...p, skills }))}
                placeholder="Add a skill..."
                aria-label="Add skill"
              />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {(candidate.skills as string[])?.map((s: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 rounded-lg text-xs font-medium">{s}</span>
                  ))}
                  {!candidate.skills?.length && <p className="text-xs text-surface-400 dark:text-surface-500 italic">No skills on file</p>}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-2">Work authorization</h3>
            <p className="text-sm text-surface-600 dark:text-surface-300">{candidate.visa_status || <span className="text-surface-400 dark:text-surface-500 italic">Not specified</span>}</p>
          </div>

          <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-4">
            <p className="text-xs text-surface-500 dark:text-surface-400">You can update experience, skills, contact info, and summary here. Education can be updated by your recruiter.</p>
          </div>
        </div>
      </div>
    </div>
    <ProfilePreviewModal
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      candidate={candidate}
      privacySettings={privacySettings}
    />
    <ToastContainer toasts={toasts} dismiss={dismiss} />
    </>
  );
}
