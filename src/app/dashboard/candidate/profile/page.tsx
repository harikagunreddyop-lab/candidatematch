'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { FileDown, Mail, Phone, MapPin, Linkedin, AlertCircle } from 'lucide-react';

export default function CandidateProfilePage() {
  const supabase = createClient();
  const [candidate, setCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<any>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data: cand } = await supabase.from('candidates').select('*').eq('user_id', session.user.id).single();
    if (!cand) { setNotLinked(true); setLoading(false); return; }
    setCandidate(cand);
    setProfileForm({
      full_name: cand.full_name || '',
      primary_title: cand.primary_title || '',
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
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleExportData = async () => {
    const res = await fetch('/api/candidate-export');
    if (!res.ok) return;
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orion-candidate-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveProfile = async () => {
    if (!candidate) return;
    setSavingProfile(true);
    setProfileError(null);
    const { error } = await supabase.from('candidates').update({
      full_name: profileForm.full_name,
      primary_title: profileForm.primary_title?.trim() || null,
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
    }).eq('id', candidate.id);
    if (error) {
      setProfileError(error.message);
    } else {
      // Sync name to profiles so admin/recruiter views stay consistent
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase.from('profiles').update({ name: profileForm.full_name?.trim() || '', updated_at: new Date().toISOString() }).eq('id', session.user.id);
      }
      setEditingProfile(false);
      await load();
    }
    setSavingProfile(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (notLinked) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center px-4">
      <p className="text-sm text-surface-500 dark:text-surface-300">Your account isn&apos;t linked to a candidate profile yet. Contact your recruiter.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100 font-display">My Profile</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleExportData} className="btn-ghost text-sm py-2 px-4 flex items-center gap-2" title="Download your data as JSON">
            <FileDown size={14} /> Export my data
          </button>
          {!editingProfile
            ? <button onClick={() => setEditingProfile(true)} className="btn-secondary text-sm py-2 px-4">Edit profile</button>
            : <div className="flex gap-2">
                <button onClick={() => setEditingProfile(false)} className="btn-ghost text-sm">Cancel</button>
                <button onClick={saveProfile} disabled={savingProfile} className="btn-primary text-sm min-w-[110px] py-2 px-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
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

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Professional summary</h3>
            {editingProfile
              ? <textarea value={profileForm.summary} onChange={e => setProfileForm((p: any) => ({ ...p, summary: e.target.value }))}
                  className="input text-sm h-28 resize-none w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                  placeholder="Brief overview of your background and goals..." />
              : <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed">{candidate.summary || <span className="text-surface-400 dark:text-surface-500 italic">No summary added</span>}</p>
            }
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Default pitch / cover snippet</h3>
            <p className="text-xs text-surface-500 dark:text-surface-400 mb-2">One paragraph for recruiters (e.g. elevator pitch or default cover intro).</p>
            {editingProfile
              ? <textarea value={profileForm.default_pitch || ''} onChange={e => setProfileForm((p: any) => ({ ...p, default_pitch: e.target.value }))}
                  className="input text-sm h-24 resize-none w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                  placeholder="e.g. Senior engineer with 8+ years in distributed systems..." />
              : <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed">{candidate.default_pitch || <span className="text-surface-400 dark:text-surface-500 italic">Not set</span>}</p>
            }
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-4">Preferences</h3>
            {editingProfile ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs dark:text-surface-200">Salary min (USD)</label>
                    <input type="number" min={0} value={profileForm.salary_min ?? ''} onChange={e => setProfileForm((p: any) => ({ ...p, salary_min: e.target.value }))} className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100" placeholder="e.g. 120000" />
                  </div>
                  <div>
                    <label className="label text-xs dark:text-surface-200">Salary max (USD)</label>
                    <input type="number" min={0} value={profileForm.salary_max ?? ''} onChange={e => setProfileForm((p: any) => ({ ...p, salary_max: e.target.value }))} className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100" placeholder="e.g. 180000" />
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

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-4">Experience</h3>
            {(candidate.experience as any[])?.length > 0 ? (
              <div className="space-y-4">
                {(candidate.experience as any[]).map((exp: any, i: number) => (
                  <div key={i} className="border-l-2 border-brand-300 dark:border-brand-500/50 pl-4">
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">{exp.title}</p>
                    <p className="text-sm text-surface-600 dark:text-surface-300">{exp.company}</p>
                    <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">{exp.start_date} — {exp.current ? 'Present' : exp.end_date}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-surface-400 dark:text-surface-500">No experience on file. Contact your recruiter to update.</p>}
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Education</h3>
            {(candidate.education as any[])?.length > 0 ? (
              <div className="space-y-3">
                {(candidate.education as any[]).map((ed: any, i: number) => (
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
          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Contact info</h3>
            {editingProfile ? (
              <div className="space-y-3">
                {(['full_name', 'phone', 'location', 'linkedin_url', 'portfolio_url'] as const).map(key => (
                  <div key={key}>
                    <label className="label text-xs dark:text-surface-200">{key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</label>
                    <input type={key === 'linkedin_url' || key === 'portfolio_url' ? 'url' : key === 'phone' ? 'tel' : 'text'} value={profileForm[key] || ''}
                      onChange={e => setProfileForm((p: any) => ({ ...p, [key]: e.target.value }))}
                      className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400 w-full" />
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

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-3">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {(candidate.skills as string[])?.map((s: string, i: number) => (
                <span key={i} className="px-3 py-1.5 bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 rounded-lg text-xs font-medium">{s}</span>
              ))}
              {!candidate.skills?.length && <p className="text-xs text-surface-400 dark:text-surface-500 italic">No skills on file</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-2">Work authorization</h3>
            <p className="text-sm text-surface-600 dark:text-surface-300">{candidate.visa_status || <span className="text-surface-400 dark:text-surface-500 italic">Not specified</span>}</p>
          </div>

          <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-4">
            <p className="text-xs text-surface-500 dark:text-surface-400">To update experience, education, or skills — contact your recruiter. You can update contact info and summary here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
