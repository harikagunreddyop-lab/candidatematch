'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Tabs, StatusBadge, Spinner, EmptyState, Modal } from '@/components/ui';
import {
  ArrowLeft, FileText, Briefcase, Download, ExternalLink,
  CheckCircle2, Sparkles, MapPin, Trash2, Plus, Link2,
  Mail, Phone, Star, RefreshCw, AlertCircle, Bell, BookmarkCheck, FileDown,
} from 'lucide-react';
import { formatDate, formatRelative, cn } from '@/utils/helpers';

// Safe array helper — handles null, undefined, postgres text arrays
function safeArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  // Postgres sometimes returns '{}' or '{a,b}' as a string
  if (typeof val === 'string') {
    if (val === '{}') return [];
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

function FitScore({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-100 text-green-700'
    : score >= 65 ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-600';
  return <span className={cn('px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums', color)}>{score}</span>;
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [candidate, setCandidate] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [resumes, setResumes] = useState<any[]>([]);
  const [uploadedResumes, setUploadedResumes] = useState<any[]>([]);
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [assignedRecruiters, setAssignedRecruiters] = useState<any[]>([]);
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('profile');
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [assigningRecruiter, setAssigningRecruiter] = useState('');
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [removingAssignment, setRemovingAssignment] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [cand, mch, apps, rvs, urv, recs, asgn, savedRes, remRes] = await Promise.all([
      supabase.from('candidates').select('*').eq('id', id).single(),
      supabase.from('candidate_job_matches').select('*, job:jobs(*)').eq('candidate_id', id).order('fit_score', { ascending: false }),
      supabase.from('applications').select('*, job:jobs(*), resume_version:resume_versions(*)').eq('candidate_id', id).order('created_at', { ascending: false }),
      supabase.from('resume_versions').select('*, job:jobs(*)').eq('candidate_id', id).order('created_at', { ascending: false }),
      supabase.from('candidate_resumes').select('*').eq('candidate_id', id).order('uploaded_at', { ascending: false }),
      supabase.from('profiles').select('id, name, email').eq('role', 'recruiter').order('name'),
      supabase.from('recruiter_candidate_assignments').select('*, recruiter:profiles!recruiter_id(id, name, email)').eq('candidate_id', id),
      supabase.from('candidate_saved_jobs').select('job_id, created_at, job:jobs(id, title, company)').eq('candidate_id', id).order('created_at', { ascending: false }),
      supabase.from('application_reminders').select('*, application:applications(job:jobs(title, company))').eq('candidate_id', id).order('remind_at'),
    ]);
    const c = cand.data;
    let merged = c;
    if (c?.user_id) {
      const { data: profile } = await supabase.from('profiles').select('name, email, phone').eq('id', c.user_id).single();
      merged = { ...c, full_name: profile?.name ?? c.full_name, email: profile?.email ?? c.email, phone: profile?.phone ?? c.phone };
    }
    setCandidate(merged);
    setMatches(mch.data || []);
    setApplications(apps.data || []);
    setResumes(rvs.data || []);
    setUploadedResumes(urv.data || []);
    setRecruiters(recs.data || []);
    setAssignedRecruiters(asgn.data || []);
    setSavedJobs(savedRes.data || []);
    setReminders(remRes.data || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Realtime sync
  useEffect(() => {
    const channel = supabase.channel(`candidate-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates', filter: `id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruiter_candidate_assignments', filter: `candidate_id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications', filter: `candidate_id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resume_versions', filter: `candidate_id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, load]);

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
        await load();
      } else {
        setResumeError([data.error, data.hint].filter(Boolean).join(' ') || 'Resume generation failed');
      }
    } catch (e) {
      console.error(e);
      setResumeError('Network error. Try again.');
    }
    setGenerating(null);
  };

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
    if (!res.ok) {
      setResumeError(data.error || 'Could not record application');
      return;
    }
    await load();
  };

  const assignRecruiter = async () => {
    if (!assigningRecruiter) return;
    setSavingAssignment(true);
    await supabase.from('recruiter_candidate_assignments')
      .upsert({ recruiter_id: assigningRecruiter, candidate_id: id }, { onConflict: 'recruiter_id,candidate_id' });
    setAssigningRecruiter('');
    await load();
    setSavingAssignment(false);
  };

  const removeRecruiter = async (recruiterId: string) => {
    setRemovingAssignment(recruiterId);
    await supabase.from('recruiter_candidate_assignments')
      .delete().eq('recruiter_id', recruiterId).eq('candidate_id', id);
    await load();
    setRemovingAssignment(null);
  };

  const downloadResume = async (pdfPath: string) => {
    const { data } = await supabase.storage.from('resumes').createSignedUrl(pdfPath, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const downloadUploadedResume = async (pdfPath: string) => {
    const { data } = await supabase.storage.from('candidate-resumes').createSignedUrl(pdfPath, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const handleExportCandidate = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/export-candidate?candidate_id=${id}`);
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `candidate-export-${candidate?.full_name?.replace(/\s+/g, '-') || id}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
    setExporting(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (!candidate) return (
    <div className="text-center py-20">
      <p className="text-surface-500 mb-4">Candidate not found</p>
      <button onClick={() => router.back()} className="btn-secondary text-sm">Go Back</button>
    </div>
  );

  // Safe arrays — handles null/undefined/bad data for candidates who haven't onboarded yet
  const skills       = safeArray(candidate.skills);
  const softSkills   = safeArray(candidate.soft_skills);
  const tools        = safeArray(candidate.tools);
  const experience   = safeArray(candidate.experience);
  const education    = safeArray(candidate.education);
  const certifications = safeArray(candidate.certifications);
  const languages    = safeArray(candidate.languages);
  const tags         = safeArray(candidate.tags);
  const targetRoles  = safeArray(candidate.target_roles);
  const targetLocs   = safeArray(candidate.target_locations);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="btn-ghost p-2"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-surface-900 font-display">{candidate.full_name}</h1>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
              candidate.active ? 'bg-green-100 text-green-700' : 'bg-surface-100 text-surface-500')}>
              {candidate.active ? 'Active' : 'Inactive'}
            </span>
            {candidate.rating > 0 && (
              <div className="flex gap-0.5">
                {Array.from({ length: candidate.rating }).map((_, i) => (
                  <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-surface-500">
            <span className="font-medium text-surface-700">
              {candidate.primary_title || <span className="italic text-surface-400">No title yet</span>}
            </span>
            {candidate.location && <span className="flex items-center gap-1"><MapPin size={12} />{candidate.location}</span>}
            {candidate.email && <a href={`mailto:${candidate.email}`} className="flex items-center gap-1 hover:text-brand-600"><Mail size={12} />{candidate.email}</a>}
            {candidate.phone && <a href={`tel:${candidate.phone}`} className="flex items-center gap-1 hover:text-brand-600"><Phone size={12} />{candidate.phone}</a>}
          </div>
        </div>
        <button onClick={handleExportCandidate} disabled={exporting} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
          {exporting ? <Spinner size={14} /> : <FileDown size={14} />} Export data
        </button>
        <button onClick={load} className="btn-ghost p-2"><RefreshCw size={14} /></button>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'profile', label: 'Profile' },
          { key: 'activity', label: 'Activity', count: savedJobs.length + reminders.length },
          { key: 'matches', label: 'Matching Jobs', count: matches.length },
          { key: 'applications', label: 'Applications', count: applications.length },
          { key: 'resumes', label: 'Generated Resumes', count: resumes.length },
          { key: 'uploads', label: 'Uploaded Resumes', count: uploadedResumes.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ── Profile Tab ── */}
      {tab === 'profile' && (
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
                      {safeArray(exp.responsibilities).length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {safeArray(exp.responsibilities).map((r: string, j: number) => (
                            <li key={j} className="text-sm text-surface-600 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-surface-400">{r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-surface-400">No experience added yet</p>}
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

            {/* Languages */}
            {languages.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800 mb-3">Languages</h3>
                <div className="flex flex-wrap gap-2">
                  {languages.map((l: any, i: number) => (
                    <span key={i} className="px-2.5 py-1 bg-surface-100 text-surface-700 rounded-lg text-xs">
                      {l.language} <span className="text-surface-400">· {l.level}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-3">Contact</h3>
              <div className="space-y-1.5 text-sm text-surface-600">
                {candidate.email && <p>{candidate.email}</p>}
                {candidate.phone && <p>{candidate.phone}</p>}
                {candidate.location && <p className="flex items-center gap-1"><MapPin size={12} />{candidate.location}</p>}
                {candidate.visa_status && <p>🛂 {candidate.visa_status}</p>}
                {candidate.availability && <p>📅 {candidate.availability}</p>}
                {candidate.salary_min && (
                  <p>💰 ${Math.round(candidate.salary_min / 1000)}k
                    {candidate.salary_max ? `–$${Math.round(candidate.salary_max / 1000)}k` : '+'}
                  </p>
                )}
              </div>
            </div>

            {skills.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800 mb-3">Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s: string, i: number) => (
                    <span key={i} className="px-2.5 py-1 bg-brand-50 text-brand-700 rounded-lg text-xs font-medium">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {softSkills.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800 mb-3">Soft Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {softSkills.map((s: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-surface-100 text-surface-600 rounded text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {tools.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800 mb-3">Tools</h3>
                <div className="flex flex-wrap gap-1.5">
                  {tools.map((s: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-surface-100 text-surface-600 rounded text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {certifications.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800 mb-3">Certifications</h3>
                <div className="space-y-2">
                  {certifications.map((cert: any, i: number) => (
                    <div key={i}>
                      <p className="text-sm font-medium text-surface-700">{cert.name}</p>
                      <p className="text-xs text-surface-500">{cert.issuer} · {cert.date}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(targetRoles.length > 0 || targetLocs.length > 0) && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800 mb-3">Preferences</h3>
                {targetRoles.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-surface-400 mb-1">Target roles</p>
                    <div className="flex flex-wrap gap-1">{targetRoles.map((r: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-surface-100 text-surface-600 rounded text-xs">{r}</span>
                    ))}</div>
                  </div>
                )}
                {targetLocs.length > 0 && (
                  <div>
                    <p className="text-xs text-surface-400 mb-1">Target locations</p>
                    <div className="flex flex-wrap gap-1">{targetLocs.map((l: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-surface-100 text-surface-600 rounded text-xs">{l}</span>
                    ))}</div>
                  </div>
                )}
              </div>
            )}

            {tags.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800 mb-3">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Recruiter Assignment */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">
                <Link2 size={14} /> Assigned Recruiters
              </h3>
              {assignedRecruiters.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {assignedRecruiters.map((a: any) => (
                    <div key={a.recruiter_id} className="flex items-center justify-between gap-2 py-1.5 px-2 bg-surface-50 rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-800 truncate">{a.recruiter?.name || a.recruiter?.email}</p>
                        <p className="text-[10px] text-surface-400 truncate">{a.recruiter?.email}</p>
                      </div>
                      <button onClick={() => removeRecruiter(a.recruiter_id)}
                        disabled={removingAssignment === a.recruiter_id}
                        className="btn-ghost p-1 text-red-400 hover:text-red-600 shrink-0">
                        {removingAssignment === a.recruiter_id ? <Spinner size={12} /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-surface-400 mb-3">No recruiter assigned</p>
              )}
              {recruiters.filter(r => !assignedRecruiters.some((a: any) => a.recruiter_id === r.id)).length > 0 && (
                <div className="flex gap-2">
                  <select value={assigningRecruiter} onChange={e => setAssigningRecruiter(e.target.value)}
                    className="input text-xs flex-1 py-1.5" aria-label="Select recruiter">
                    <option value="">Assign recruiter...</option>
                    {recruiters
                      .filter(r => !assignedRecruiters.some((a: any) => a.recruiter_id === r.id))
                      .map(r => <option key={r.id} value={r.id}>{r.name || r.email}</option>)}
                  </select>
                  <button onClick={assignRecruiter} disabled={!assigningRecruiter || savingAssignment}
                    className="btn-primary text-xs py-1.5 px-2.5 shrink-0">
                    {savingAssignment ? <Spinner size={12} /> : <Plus size={14} />}
                  </button>
                </div>
              )}
            </div>

            {/* Internal notes */}
            {(candidate.internal_notes || candidate.interview_notes) && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-surface-800 mb-3">Internal Notes</h3>
                {candidate.internal_notes && (
                  <p className="text-xs text-surface-600 mb-2 leading-relaxed">{candidate.internal_notes}</p>
                )}
                {candidate.interview_notes && (
                  <>
                    <p className="text-xs font-medium text-surface-500 mb-1">Interview notes</p>
                    <p className="text-xs text-surface-600 leading-relaxed">{candidate.interview_notes}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Activity Tab (candidate sync: saved jobs, reminders, pitch, timeline) ── */}
      {tab === 'activity' && (
        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2">Default pitch & preferences (candidate-facing)</h3>
            {candidate.default_pitch ? <p className="text-sm text-surface-600 whitespace-pre-wrap">{candidate.default_pitch}</p> : <p className="text-sm text-surface-400 italic">Not set</p>}
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-surface-500">
              {candidate.salary_min != null && <span>Salary: ${(candidate.salary_min / 1000).toFixed(0)}k{candidate.salary_max ? `–$${(candidate.salary_max / 1000).toFixed(0)}k` : '+'}</span>}
              {candidate.availability && <span>Availability: {candidate.availability}</span>}
              <span>Open to remote: {candidate.open_to_remote !== false ? 'Yes' : 'No'}</span>
              {candidate.last_seen_matches_at && <span>Last seen matches: {formatDate(candidate.last_seen_matches_at)}</span>}
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2"><BookmarkCheck size={14} /> Saved jobs ({savedJobs.length})</h3>
            {savedJobs.length === 0 ? <p className="text-sm text-surface-400">None</p> : (
              <ul className="space-y-1.5">
                {savedJobs.map((s: any) => (
                  <li key={s.job_id} className="text-sm text-surface-600 flex items-center gap-2">
                    <span>{s.job?.title} at {s.job?.company}</span>
                    <span className="text-surface-400 text-xs">{formatRelative(s.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2"><Bell size={14} /> Reminders ({reminders.length})</h3>
            {reminders.length === 0 ? <p className="text-sm text-surface-400">None</p> : (
              <ul className="space-y-1.5">
                {reminders.map((r: any) => (
                  <li key={r.id} className="text-sm text-surface-600 flex items-center gap-2">
                    <span>{r.application?.job?.title} at {r.application?.job?.company}</span>
                    <span className="text-surface-400 text-xs">{formatDate(r.remind_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-800 mb-3">Activity timeline</h3>
            {(() => {
              const events = [
                ...applications.map((a: any) => ({ at: a.applied_at || a.updated_at, label: `Applied to ${a.job?.title} at ${a.job?.company}`, status: a.status })),
                ...matches.slice(0, 15).map((m: any) => ({ at: m.matched_at || m.created_at, label: `Match: ${m.job?.title} at ${m.job?.company} (${m.fit_score})`, status: null })),
              ].filter(e => e.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);
              if (events.length === 0) return <p className="text-sm text-surface-400">No activity yet</p>;
              return (
                <ul className="space-y-1.5">
                  {events.map((e, i) => (
                    <li key={i} className="text-sm text-surface-600 flex items-center gap-2">
                      <span className="text-surface-400 text-xs w-24 shrink-0">{formatRelative(e.at)}</span>
                      <span>{e.label}</span>
                      {e.status && <StatusBadge status={e.status} />}
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Matches Tab ── */}
      {tab === 'matches' && (
        <div className="space-y-3">
          {resumeError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{resumeError}</span>
              <button type="button" onClick={() => setResumeError(null)} className="ml-auto text-amber-600 hover:text-amber-800 p-1" aria-label="Dismiss">✕</button>
            </div>
          )}
          {matches.length === 0 ? (
            <EmptyState icon={<Briefcase size={24} />} title="No matches yet"
              description="Run the matching engine or upload more jobs" />
          ) : matches.map(m => (
            <div key={m.id} className="card p-4">
              <div className="flex items-start gap-4">
                <FitScore score={m.fit_score} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-semibold text-surface-900">{m.job?.title}</p>
                      <p className="text-sm text-surface-500">{m.job?.company} · {m.job?.location || 'Location not listed'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.job?.url && (
                        <a href={m.job.url} target="_blank" rel="noopener noreferrer" className="btn-ghost p-1.5">
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <button
                        onClick={() => generateResume(m.job_id)}
                        disabled={generating === m.job_id || (m.fit_score ?? 0) >= 75}
                        title={(m.fit_score ?? 0) >= 75 ? 'Resume generation is only available for matches with score below 75' : undefined}
                        className={(m.fit_score ?? 0) >= 75 ? 'btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 opacity-70 cursor-not-allowed' : 'btn-primary text-xs py-1.5 px-3 flex items-center gap-1'}
                      >
                        {generating === m.job_id ? <Spinner size={12} /> : <Sparkles size={12} />} Generate Resume
                      </button>
                    </div>
                  </div>
                  {m.match_reason && <p className="text-xs text-surface-400 mt-1 italic line-clamp-2">{m.match_reason}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {safeArray(m.matched_keywords).slice(0, 5).map((k: string, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[11px]">✓ {k}</span>
                    ))}
                    {safeArray(m.missing_keywords).slice(0, 3).map((k: string, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[11px]">✗ {k}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Applications Tab ── */}
      {tab === 'applications' && (
        <div>
          {applications.length === 0 ? (
            <EmptyState icon={<FileText size={24} />} title="No applications"
              description="Generate a resume and mark applied" />
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Job</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Applied</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Candidate note</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Interview notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {applications.map(a => (
                    <tr key={a.id} className="hover:bg-surface-50">
                      <td className="px-4 py-3 font-medium text-surface-900">{a.job?.title}</td>
                      <td className="px-4 py-3 text-surface-500">{a.job?.company}</td>
                      <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-4 py-3 text-surface-400 text-xs">{a.applied_at ? formatDate(a.applied_at) : '—'}</td>
                      <td className="px-4 py-3 text-surface-500 text-xs max-w-[160px] truncate" title={a.candidate_notes || ''}>{a.candidate_notes || '—'}</td>
                      <td className="px-4 py-3 text-surface-500 text-xs max-w-[160px] truncate" title={a.interview_notes || ''}>{a.interview_notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Generated Resumes Tab ── */}
      {tab === 'resumes' && (
        <div>
          {resumes.length === 0 ? (
            <EmptyState icon={<FileText size={24} />} title="No generated resumes"
              description="Generate resumes from the Matching Jobs tab" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {resumes.map(r => (
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
                      <button onClick={() => downloadResume(r.pdf_path)}
                        className="btn-secondary text-xs py-1.5 flex items-center gap-1">
                        <Download size={13} /> Download
                      </button>
                      <button onClick={() => markApplied(r.job_id, r.id)}
                        className="btn-primary text-xs py-1.5 flex items-center gap-1">
                        <CheckCircle2 size={13} /> Mark Applied
                      </button>
                    </div>
                  )}
                  {r.generation_status === 'failed' && (
                    <p className="text-xs text-red-500 mt-2">{r.error_message || 'Generation failed'}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Uploaded Resumes Tab ── */}
      {tab === 'uploads' && (
        <div>
          {uploadedResumes.length === 0 ? (
            <EmptyState icon={<FileText size={24} />} title="No uploaded resumes"
              description="Candidate hasn't uploaded any resume files yet" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uploadedResumes.map(r => (
                <div key={r.id} className="card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-surface-900">{r.label || r.file_name}</p>
                      <p className="text-xs text-surface-500">{r.file_name}</p>
                    </div>
                    <span className="text-xs text-surface-400">
                      {r.file_size ? `${Math.round(r.file_size / 1024)}KB` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-surface-400 mt-2">{formatRelative(r.uploaded_at)}</p>
                  <button onClick={() => downloadUploadedResume(r.pdf_path)}
                    className="btn-secondary text-xs py-1.5 flex items-center gap-1 mt-3">
                    <Download size={13} /> Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}