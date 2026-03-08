'use client';
/**
 * 5-Step Candidate Onboarding Wizard
 *
 * Steps:
 * 1. Basics     — name, email, phone, location
 * 2. Resume     — upload PDF (creates candidate_resumes row)
 * 3. Profile    — autofill from resume, edit skills/experience/education
 * 4. Preferences — target roles, locations, remote, visa, salary range
 * 5. Review     — summary + launch first run
 */
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function CandidateOnboardingPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Step 1: Basics ──
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');

  // ── Step 2: Resume file ──
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUploaded, setResumeUploaded] = useState(false);

  // ── Step 3: Skills & experience ──
  const [skills, setSkills] = useState('');
  const [primaryTitle, setPrimaryTitle] = useState('');
  const [yearsExp, setYearsExp] = useState('');

  // ── Step 4: Preferences ──
  const [targetRoles, setTargetRoles] = useState('');
  const [targetLocations, setTargetLocations] = useState('');
  const [remote, setRemote] = useState(false);
  const [visaStatus, setVisaStatus] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');

  // ── Candidate ID (set after step 1 creates the record) ──
  const [candidateId, setCandidateId] = useState<string | null>(null);

  // Auth: show "Not logged in" upfront instead of only on Continue
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthStatus(data?.user ? 'authenticated' : 'unauthenticated');
      if (data?.user?.email) setEmail(data.user.email);
    });
  }, [supabase]);

  const next = () => { setError(''); setStep(s => Math.min(s + 1, 5)); };
  const back = () => { setError(''); setStep(s => Math.max(s - 1, 1)); };

  // ── Step 1: Create candidate record ──
  const saveBasics = useCallback(async () => {
    if (!fullName.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      // Check if candidate already exists
      const { data: existing } = await supabase
        .from('candidates')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existing) {
        await supabase.from('candidates').update({
          full_name: fullName.trim(),
          email: email.trim() || user.email,
          phone: phone.trim() || null,
          location: location.trim() || null,
          onboarding_step: 1,
        }).eq('id', existing.id);
        setCandidateId(existing.id);
      } else {
        const { data: newCandidate, error: insertErr } = await supabase
          .from('candidates')
          .insert({
            user_id: user.id,
            full_name: fullName.trim(),
            email: email.trim() || user.email,
            phone: phone.trim() || null,
            location: location.trim() || null,
            status: 'active',
            onboarding_step: 1,
          })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        setCandidateId(newCandidate!.id);
      }
      next();
    } catch (err: any) {
      const msg = err?.message || 'Failed to save';
      setError(msg === 'Not logged in' ? 'You\'re not logged in. Please sign in and try again.' : msg);
    } finally { setSaving(false); }
  }, [fullName, email, phone, location, supabase]);

  // ── Step 2: Upload resume ──
  const uploadResume = useCallback(async () => {
    if (!resumeFile || !candidateId) { setError('Please select a PDF'); return; }
    setSaving(true); setError('');
    try {
      const formData = new FormData();
      formData.append('file', resumeFile);
      formData.append('candidate_id', candidateId);
      formData.append('label', 'Onboarding Resume');

      const res = await fetch('/api/resumes', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      setResumeUploaded(true);

      // Update onboarding step
      await supabase.from('candidates').update({ onboarding_step: 2 }).eq('id', candidateId);
      next();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally { setSaving(false); }
  }, [resumeFile, candidateId, supabase]);

  // ── Step 3: Save profile ──
  const saveProfile = useCallback(async () => {
    if (!candidateId) return;
    setSaving(true); setError('');
    try {
      const skillsArr = skills.split(',').map(s => s.trim()).filter(Boolean);
      await supabase.from('candidates').update({
        skills: skillsArr,
        primary_title: primaryTitle.trim() || null,
        years_of_experience: yearsExp ? parseInt(yearsExp) : null,
        onboarding_step: 3,
      }).eq('id', candidateId);
      next();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally { setSaving(false); }
  }, [candidateId, skills, primaryTitle, yearsExp, supabase]);

  // ── Step 4: Save preferences ──
  const savePreferences = useCallback(async () => {
    if (!candidateId) return;
    setSaving(true); setError('');
    try {
      const rolesArr = targetRoles.split(',').map(s => s.trim()).filter(Boolean);
      const locsArr = targetLocations.split(',').map(s => s.trim()).filter(Boolean);
      await supabase.from('candidates').update({
        target_roles: rolesArr,
        target_locations: locsArr,
        open_to_remote: remote,
        visa_status: visaStatus.trim() || null,
        salary_min: salaryMin ? parseInt(salaryMin) : null,
        salary_max: salaryMax ? parseInt(salaryMax) : null,
        onboarding_step: 4,
      }).eq('id', candidateId);
      next();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally { setSaving(false); }
  }, [candidateId, targetRoles, targetLocations, remote, visaStatus, salaryMin, salaryMax, supabase]);

  // ── Step 5: Complete ──
  const complete = useCallback(async () => {
    if (!candidateId) return;
    setSaving(true); setError('');
    try {
      await supabase.from('candidates').update({
        onboarding_completed: true,
        onboarding_step: 5,
      }).eq('id', candidateId);
      router.replace('/dashboard/candidate');
    } catch (err: any) {
      setError(err.message || 'Failed to complete');
    } finally { setSaving(false); }
  }, [candidateId, supabase, router]);

  // ── Styles ──
  const card = 'max-w-2xl mx-auto bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-8 mt-12';
  const heading = 'text-2xl font-bold text-neutral-900 dark:text-white mb-2';
  const subtitle = 'text-neutral-500 dark:text-neutral-400 mb-6';
  const label = 'block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1';
  const input = 'w-full px-4 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition';
  const btn = 'px-6 py-2.5 rounded-lg font-medium transition-all';
  const btnPrimary = `${btn} bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50`;
  const btnSecondary = `${btn} bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 py-8 px-4">
      {/* Progress bar — only when authenticated */}
      {authStatus === 'authenticated' && (
        <div className="max-w-2xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-2">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-all ${s <= step ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400'}`}>
              {s < step ? '✓' : s}
            </div>
          ))}
        </div>
        <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 transition-all duration-500 rounded-full" style={{ width: `${((step - 1) / 4) * 100}%` }} />
        </div>
      </div>
      )}

      {error && (
        <div className="max-w-2xl mx-auto mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm flex flex-wrap items-center gap-2">
          <span>{error}</span>
          {error.includes('not logged in') && (
            <a href="/auth" className="underline font-medium hover:no-underline">Sign in →</a>
          )}
        </div>
      )}

      {/* Not logged in — show sign-in prompt instead of form */}
      {authStatus === 'unauthenticated' && (
        <div className={card}>
          <h1 className={heading}>Sign in required</h1>
          <p className={subtitle}>You need to be signed in to complete onboarding.</p>
          <a href="/auth" className={`${btnPrimary} inline-block`}>Sign in →</a>
        </div>
      )}

      {/* Loading auth */}
      {authStatus === 'loading' && (
        <div className={card}>
          <p className={subtitle}>Checking sign-in…</p>
        </div>
      )}

      {/* Step 1: Basics */}
      {authStatus === 'authenticated' && step === 1 && (
        <div className={card}>
          <h1 className={heading}>Welcome to CandidateMatch</h1>
          <p className={subtitle}>Let&apos;s start with your basic information</p>
          <div className="space-y-4">
            <div>
              <label className={label}>Full Name *</label>
              <input className={input} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Doe" />
            </div>
            <div>
              <label className={label}>Email</label>
              <input className={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Phone</label>
                <input className={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555-0123" />
              </div>
              <div>
                <label className={label}>Location</label>
                <input className={input} value={location} onChange={e => setLocation(e.target.value)} placeholder="San Francisco, CA" />
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <button className={btnPrimary} onClick={saveBasics} disabled={saving}>
              {saving ? 'Saving...' : 'Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Resume Upload */}
      {authStatus === 'authenticated' && step === 2 && (
        <div className={card}>
          <h1 className={heading}>Upload Your Resume</h1>
          <p className={subtitle}>We&apos;ll use this to pre-fill your profile and match you to jobs</p>
          <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-xl p-8 text-center">
            <input
              type="file"
              accept="application/pdf"
              onChange={e => setResumeFile(e.target.files?.[0] || null)}
              className="hidden"
              id="resume-upload"
            />
            <label htmlFor="resume-upload" className="cursor-pointer block">
              <div className="text-4xl mb-2">📄</div>
              <p className="text-neutral-600 dark:text-neutral-400">
                {resumeFile ? resumeFile.name : 'Click to select a PDF resume'}
              </p>
              <p className="text-xs text-neutral-400 mt-1">PDF only, max 10MB</p>
            </label>
          </div>
          <div className="flex justify-between mt-6">
            <button className={btnSecondary} onClick={back}>← Back</button>
            <div className="flex gap-3">
              <button className={`${btn} text-neutral-500 hover:text-neutral-700`} onClick={next}>
                Skip for now
              </button>
              <button className={btnPrimary} onClick={uploadResume} disabled={saving || !resumeFile}>
                {saving ? 'Uploading...' : 'Upload & Continue →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Profile */}
      {authStatus === 'authenticated' && step === 3 && (
        <div className={card}>
          <h1 className={heading}>Your Professional Profile</h1>
          <p className={subtitle}>Tell us about your skills and experience</p>
          <div className="space-y-4">
            <div>
              <label className={label}>Primary Job Title</label>
              <input className={input} value={primaryTitle} onChange={e => setPrimaryTitle(e.target.value)} placeholder="Senior Software Engineer" />
            </div>
            <div>
              <label className={label}>Years of Experience</label>
              <input className={input} type="number" value={yearsExp} onChange={e => setYearsExp(e.target.value)} placeholder="5" min="0" max="50" />
            </div>
            <div>
              <label className={label}>Skills (comma-separated)</label>
              <textarea className={`${input} min-h-[100px]`} value={skills} onChange={e => setSkills(e.target.value)} placeholder="React, TypeScript, Node.js, PostgreSQL, AWS" />
            </div>
          </div>
          <div className="flex justify-between mt-6">
            <button className={btnSecondary} onClick={back}>← Back</button>
            <button className={btnPrimary} onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving...' : 'Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Preferences */}
      {authStatus === 'authenticated' && step === 4 && (
        <div className={card}>
          <h1 className={heading}>Job Preferences</h1>
          <p className={subtitle}>Help us find the right opportunities for you</p>
          <div className="space-y-4">
            <div>
              <label className={label}>Target Roles (comma-separated)</label>
              <input className={input} value={targetRoles} onChange={e => setTargetRoles(e.target.value)} placeholder="Software Engineer, Full Stack Developer" />
            </div>
            <div>
              <label className={label}>Preferred Locations (comma-separated)</label>
              <input className={input} value={targetLocations} onChange={e => setTargetLocations(e.target.value)} placeholder="San Francisco, New York, Remote" />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="remote-check" checked={remote} onChange={e => setRemote(e.target.checked)} className="w-4 h-4 rounded border-neutral-300 text-blue-600" />
              <label htmlFor="remote-check" className="text-sm text-neutral-700 dark:text-neutral-300">Open to remote work</label>
            </div>
            <div>
              <label className={label}>Visa Status</label>
              <select className={input} value={visaStatus} onChange={e => setVisaStatus(e.target.value)}>
                <option value="">Select...</option>
                <option value="us_citizen">US Citizen</option>
                <option value="green_card">Green Card</option>
                <option value="h1b">H-1B</option>
                <option value="opt">OPT</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Min Salary ($)</label>
                <input className={input} type="number" value={salaryMin} onChange={e => setSalaryMin(e.target.value)} placeholder="80000" />
              </div>
              <div>
                <label className={label}>Max Salary ($)</label>
                <input className={input} type="number" value={salaryMax} onChange={e => setSalaryMax(e.target.value)} placeholder="150000" />
              </div>
            </div>
          </div>
          <div className="flex justify-between mt-6">
            <button className={btnSecondary} onClick={back}>← Back</button>
            <button className={btnPrimary} onClick={savePreferences} disabled={saving}>
              {saving ? 'Saving...' : 'Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Review & Launch */}
      {authStatus === 'authenticated' && step === 5 && (
        <div className={card}>
          <h1 className={heading}>You&apos;re All Set! 🎉</h1>
          <p className={subtitle}>Here&apos;s a summary of your profile. Complete onboarding to see your first job matches.</p>
          <div className="space-y-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl p-4">
            <div className="flex justify-between"><span className="text-neutral-500">Name</span><span className="font-medium">{fullName}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Title</span><span className="font-medium">{primaryTitle || '—'}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Experience</span><span className="font-medium">{yearsExp ? `${yearsExp} years` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Skills</span><span className="font-medium text-right max-w-[60%]">{skills || '—'}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Target Roles</span><span className="font-medium text-right max-w-[60%]">{targetRoles || '—'}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Remote</span><span className="font-medium">{remote ? 'Yes' : 'No'}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Resume</span><span className="font-medium">{resumeUploaded ? '✅ Uploaded' : 'Not uploaded'}</span></div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between gap-4 mt-6">
            <a href="/dashboard/candidate/matches" className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white text-center`}>
              View your matches →
            </a>
            <div className="flex gap-3">
              <button className={btnSecondary} onClick={back}>← Back</button>
              <button className={btnPrimary} onClick={complete} disabled={saving}>
                {saving ? 'Launching...' : 'Complete & Go to Dashboard →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
