'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { EmptyState, Spinner, StatusBadge, ToastContainer } from '@/components/ui';
import { useToast } from '@/hooks';
import {
  ClipboardList, Briefcase, FileText, User, Upload, Download,
  Trash2, AlertCircle, Plus, ExternalLink, ChevronRight,
  TrendingUp, Target, Star, CheckCircle2, X, MapPin,
  Linkedin, Phone, Mail, RefreshCw, Sparkles, Zap,
  Bookmark, BookmarkCheck, Bell, Calendar, FileDown, Settings,
  ArrowRight, Lightbulb, Award, Brain,
} from 'lucide-react';
import { formatDate, formatRelative, cn } from '@/utils/helpers';
import { getScoreLabel, getScoreBadgeClasses, canApply, SCORE_APPLY_OK, SCORE_APPLY_CAUTION } from '@/lib/ats-score';

interface CandidateResume {
  id: string;
  label: string;
  pdf_path: string;
  file_name: string;
  file_size: number;
  uploaded_at: string;
}

const MAX_RESUMES = 5;
const CANDIDATE_DAILY_APPLY_LIMIT = 40;

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ATSScoreBadge({ score, decision }: { score: number; decision?: string }) {
  const { bg, text } = getScoreBadgeClasses(score);
  const label = decision ?? getScoreLabel(score);
  return (
    <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 ring-1', bg, text)}>
      <span className="text-base font-bold tabular-nums">{score}</span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function StatCard({ label, value, icon, color, subtext }: { label: string; value: any; icon: React.ReactNode; color: string; subtext?: string }) {
  return (
    <div className="group rounded-2xl bg-surface-800 border border-surface-700/60 p-5 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center gap-3">
      <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110', color)}>{icon}</div>
      <div>
        <p className="text-3xl font-extrabold text-surface-100 tabular-nums font-display tracking-tight">{value}</p>
        <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-widest mt-1">{label}</p>
        {subtext && <p className="text-[10px] text-surface-500 mt-1">{subtext}</p>}
      </div>
    </div>
  );
}

function parseMatchReason(reason: string) {
  const parts = (reason || '').split('|').map(s => s.trim());
  return {
    strength: parts.find(p => p.startsWith('[STRENGTH]'))?.replace('[STRENGTH]', '').trim() || '',
    gap: parts.find(p => p.startsWith('[GAP]'))?.replace('[GAP]', '').trim() || '',
    risk: parts.find(p => p.startsWith('[RISK]'))?.replace('[RISK]', '').trim() || '',
    resume: parts.find(p => p.startsWith('[RESUME]'))?.replace('[RESUME]', '').trim() || '',
  };
}

function SendPasswordReset() {
  const supabase = createClient();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleSend = async () => {
    setSending(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (!email) {
      setError('No email on file');
      setSending(false);
      return;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/auth/reset-password` });
    if (err) {
      setError(err.message);
    } else {
      setSent(true);
    }
    setSending(false);
  };
  return (
    <div className="space-y-2">
      <button onClick={handleSend} disabled={sending || sent} className="btn-primary text-sm py-2 px-4">
        {sending ? <Spinner size={14} className="inline" /> : sent ? 'Check your email' : 'Send password reset email'}
      </button>
      {sent && <p className="text-xs text-emerald-600 dark:text-emerald-400">We sent a link to your email. Use it to set a new password.</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export default function CandidateDashboard() {
  const supabase = createClient();
  const [candidate, setCandidate] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [uploadedResumes, setUploadedResumes] = useState<CandidateResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'matches' | 'applications' | 'resumes' | 'saved' | 'reminders'>('overview');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [matchDateFilter, setMatchDateFilter] = useState<'all' | '7' | '30' | '90'>('all');
  const [notLinked, setNotLinked] = useState(false);

  // Per-job AI brief (like recruiter)
  const [briefJobId, setBriefJobId] = useState<string | null>(null);
  const [briefText, setBriefText] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  // Resume upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [deletingResume, setDeletingResume] = useState<CandidateResume | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Apply + confirm modal (resume picker, candidate_notes)
  const [applying, setApplying] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [confirmAppliedJobId, setConfirmAppliedJobId] = useState<string | null>(null);
  const [confirmResumeId, setConfirmResumeId] = useState<string | null>(null);
  const [confirmNotes, setConfirmNotes] = useState('');

  // Saved jobs (bookmarks)
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());

  // Reminders
  const [reminders, setReminders] = useState<any[]>([]);

  // Tailored resumes per job
  const [tailoredResumes, setTailoredResumes] = useState<Record<string, any>>({});
  const [tailoringJobId, setTailoringJobId] = useState<string | null>(null);

  // New matches highlight
  const [newMatchesCount, setNewMatchesCount] = useState(0);
  // Application usage (rate limit display)
  const [applicationUsage, setApplicationUsage] = useState<{ used_today: number; limit: number } | null>(null);
  const { toasts, toast, dismiss } = useToast();

  // Profile edit + preferences + default pitch
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<any>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data: cand } = await supabase
      .from('candidates').select('*').eq('user_id', session.user.id).single();

    if (!cand) { setNotLinked(true); setLoading(false); return; }
    setCandidate(cand);
    loadTailoredResumes(cand.id);
    setProfileForm({
      full_name: cand.full_name || '',
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

    const [mch, apps, resumes, savedRes, remindersRes] = await Promise.all([
      supabase.from('candidate_job_matches')
        .select('*, job:jobs(id, title, company, location, url, remote_type, job_type, salary_min, salary_max)')
        .eq('candidate_id', cand.id)
        .order('fit_score', { ascending: false })
        .limit(50),
      supabase.from('applications')
        .select('*, job:jobs(title, company, location, url)')
        .eq('candidate_id', cand.id)
        .order('created_at', { ascending: false }),
      fetch(`/api/candidate-resumes?candidate_id=${cand.id}`).then(r => r.json()),
      supabase.from('candidate_saved_jobs').select('job_id').eq('candidate_id', cand.id),
      supabase.from('application_reminders').select('*, application:applications(job:jobs(title, company))').eq('candidate_id', cand.id).gte('remind_at', new Date().toISOString()).order('remind_at'),
    ]);

    const mchData = mch.data || [];
    const appsData = apps.data || [];
    setMatches(mchData);
    setApplications(appsData);
    setUploadedResumes(resumes.resumes || []);
    setSavedJobIds(new Set((savedRes.data || []).map((s: any) => s.job_id)));
    setReminders(remindersRes.data || []);

    // New matches since last visit
    const lastSeen = cand.last_seen_matches_at ? new Date(cand.last_seen_matches_at).getTime() : 0;
    const newCount = mchData.filter((m: any) => new Date(m.matched_at || m.created_at).getTime() > lastSeen).length;
    setNewMatchesCount(newCount);
    await supabase.from('candidates').update({ last_seen_matches_at: new Date().toISOString() }).eq('id', cand.id);

    const tzOffset = new Date().getTimezoneOffset();
    const usageRes = await fetch(`/api/applications/usage?tz_offset=${-tzOffset}`);
    if (usageRes.ok) {
      const u = await usageRes.json();
      setApplicationUsage({ used_today: u.used_today ?? 0, limit: u.limit ?? CANDIDATE_DAILY_APPLY_LIMIT });
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!candidate) return;
    const cid = candidate.id;
    const channel = supabase.channel('candidate-dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidate_job_matches', filter: `candidate_id=eq.${cid}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications', filter: `candidate_id=eq.${cid}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidate_saved_jobs', filter: `candidate_id=eq.${cid}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'application_reminders', filter: `candidate_id=eq.${cid}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [candidate?.id]);

  const openConfirmApplied = (jobId: string) => {
    setConfirmAppliedJobId(jobId);
    setConfirmResumeId(null);
    setConfirmNotes('');
    setApplyError(null);
  };

  const applyToJob = async (jobId: string, resumeId?: string | null, candidateNotes?: string) => {
    if (!candidate) return;
    setApplying(jobId);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidate.id,
          job_id: jobId,
          status: 'applied',
          applied_at: new Date().toISOString(),
          candidate_resume_id: resumeId || null,
          candidate_notes: candidateNotes?.trim() || null,
          tz_offset: new Date().getTimezoneOffset(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApplyError(data.error || 'Could not submit application');
        setApplying(null);
        return;
      }
      setApplyError(null);
      setConfirmAppliedJobId(null);
      const jobTitle = (data as any).job?.title;
      const company = (data as any).job?.company;
      toast(jobTitle && company ? `Applied to ${jobTitle} at ${company}` : 'Application submitted', 'success');
      await load();
    } finally {
      setApplying(null);
    }
  };

  const toggleSavedJob = async (jobId: string) => {
    if (!candidate) return;
    const isSaved = savedJobIds.has(jobId);
    if (isSaved) {
      await supabase.from('candidate_saved_jobs').delete().eq('candidate_id', candidate.id).eq('job_id', jobId);
      setSavedJobIds(prev => { const n = new Set(prev); n.delete(jobId); return n; });
    } else {
      await supabase.from('candidate_saved_jobs').insert({ candidate_id: candidate.id, job_id: jobId });
      setSavedJobIds(prev => new Set(prev).add(jobId));
    }
  };

  const addReminder = async (applicationId: string, days: number) => {
    if (!candidate) return;
    const d = new Date();
    d.setDate(d.getDate() + days);
    await supabase.from('application_reminders').insert({
      application_id: applicationId,
      candidate_id: candidate.id,
      remind_at: d.toISOString(),
    });
    await load();
  };

  const removeReminder = async (reminderId: string) => {
    await supabase.from('application_reminders').delete().eq('id', reminderId);
    setReminders(prev => prev.filter(r => r.id !== reminderId));
  };

  const updateApplicationNotes = async (applicationId: string, candidate_notes: string) => {
    await supabase.from('applications').update({ candidate_notes: candidate_notes || null }).eq('id', applicationId);
    setApplications(prev => prev.map(a => a.id === applicationId ? { ...a, candidate_notes: candidate_notes || null } : a));
  };

  const updateApplicationInterview = async (applicationId: string, interview_date: string | null, interview_notes: string) => {
    await supabase.from('applications').update({
      interview_date: interview_date || null,
      interview_notes: interview_notes || null,
    }).eq('id', applicationId);
    await load();
  };

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

  const generateJobBrief = async (jobId: string) => {
    setBriefJobId(jobId);
    setBriefText(null);
    setBriefError(null);
    setBriefLoading(true);
    try {
      const res = await fetch('/api/candidate-job-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate brief');
      setBriefText(data.brief);
    } catch (e: any) {
      setBriefError(e.message);
    }
    setBriefLoading(false);
  };

  const loadTailoredResumes = async (candidateId: string) => {
    try {
      const res = await fetch(`/api/tailor-resume?candidate_id=${candidateId}`);
      const data = await res.json();
      if (data.tailored_resumes) {
        const map: Record<string, any> = {};
        for (const rv of data.tailored_resumes) {
          if (!map[rv.job_id] || new Date(rv.created_at) > new Date(map[rv.job_id].created_at)) {
            map[rv.job_id] = rv;
          }
        }
        setTailoredResumes(map);
      }
    } catch {}
  };

  const triggerTailorResume = async (candidateId: string, jobId: string) => {
    setTailoringJobId(jobId);
    try {
      const res = await fetch('/api/tailor-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: candidateId, job_id: jobId }),
      });
      const data = await res.json();
      if (res.ok || res.status === 409) {
        setTailoredResumes(prev => ({
          ...prev,
          [jobId]: { job_id: jobId, generation_status: 'pending', id: data.resume_version_id },
        }));
        pollTailoredResume(candidateId, jobId);
      }
    } catch {}
    setTailoringJobId(null);
  };

  const pollTailoredResume = (candidateId: string, jobId: string) => {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const res = await fetch(`/api/tailor-resume?candidate_id=${candidateId}&job_id=${jobId}`);
        const data = await res.json();
        const latest = data.tailored_resumes?.[0];
        if (latest) {
          setTailoredResumes(prev => ({ ...prev, [jobId]: latest }));
          if (['pending', 'generating', 'compiling', 'uploading'].includes(latest.generation_status) && attempts < 60) {
            setTimeout(poll, 3000);
            return;
          }
        }
      } catch {}
    };
    setTimeout(poll, 2000);
  };

  const downloadTailoredResume = async (pdfPath: string, jobTitle: string) => {
    try {
      const supabase2 = createClient();
      const { data, error } = await supabase2.storage.from('resumes').download(pdfPath);
      if (!data || error) {
        toast('Could not download tailored resume. Please try again.', 'error');
        return;
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Resume_Tailored_${jobTitle.replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('Could not download tailored resume. Please try again.', 'error');
    }
  };

  const handleUpload = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('candidate_id', candidate.id);
    formData.append('label', uploadLabel.trim() || file.name.replace('.pdf', ''));
    try {
      const res = await fetch('/api/candidate-resumes', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setShowUploadModal(false);
      setUploadLabel('');
      await load();
    } catch (e: any) {
      setUploadError(e.message);
    }
    setUploading(false);
  };

  const handleDeleteResume = async () => {
    if (!deletingResume) return;
    setDeleting(true);
    const res = await fetch('/api/candidate-resumes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_id: deletingResume.id }),
    });
    if (res.ok) { setDeletingResume(null); await load(); }
    setDeleting(false);
  };

  const downloadResume = async (pdfPath: string) => {
    try {
      const { data, error } = await supabase.storage.from('resumes').download(pdfPath);
      if (!data || error) {
        toast('Could not download resume. Please try again.', 'error');
        return;
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      const fileName = pdfPath.split('/').pop() || 'resume.pdf';
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('Could not download resume. Please try again.', 'error');
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    const { error } = await supabase.from('candidates').update({
      full_name: profileForm.full_name,
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
    if (error) setProfileError(error.message);
    else { setEditingProfile(false); await load(); }
    setSavingProfile(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;

  if (notLinked) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center px-4">
      <div className="w-20 h-20 rounded-2xl bg-surface-100 dark:bg-surface-700 flex items-center justify-center">
        <User size={36} className="text-surface-400 dark:text-surface-400" />
      </div>
      <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100 font-display">Profile not linked</h2>
      <p className="text-sm text-surface-500 dark:text-surface-300 max-w-sm">Your account hasn&apos;t been linked to a candidate profile yet. Please contact your recruiter to get started.</p>
    </div>
  );

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })();
  const firstName = candidate.full_name?.split(' ')[0] || 'there';

  const topScore = matches[0]?.fit_score || 0;
  const avgScore = matches.length > 0 ? Math.round(matches.reduce((s, m) => s + m.fit_score, 0) / matches.length) : 0;
  const interviewPossible = matches.filter(m => m.fit_score >= SCORE_APPLY_OK).length;
  const cautionCount = matches.filter(m => m.fit_score >= SCORE_APPLY_CAUTION && m.fit_score < SCORE_APPLY_OK).length;
  const alreadyApplied = new Set(applications.map(a => a.job_id));
  const availableMatches = matches.filter(m => !alreadyApplied.has(m.job_id));
  const appliedMatches = matches.filter(m => alreadyApplied.has(m.job_id));

  const matchDateCutoff = matchDateFilter === 'all' ? 0 : Date.now() - parseInt(matchDateFilter, 10) * 24 * 60 * 60 * 1000;
  const filteredAvailableMatches = availableMatches.filter(m => {
    if (matchDateFilter === 'all') return true;
    const t = new Date(m.matched_at || m.created_at).getTime();
    return t >= matchDateCutoff;
  });
  const filteredAvailableForSaved = showSavedOnly ? filteredAvailableMatches.filter(m => savedJobIds.has(m.job_id)) : filteredAvailableMatches;

  const interviewApps = applications.filter((a: any) => a.status === 'interview');
  const savedMatches = matches.filter(m => savedJobIds.has(m.job_id));

  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const applicationsThisWeek = applications.filter((a: any) => new Date(a.applied_at || a.created_at).getTime() >= oneWeekAgo).length;

  const profileCompletenessItems = [
    !!candidate.full_name?.trim(),
    !!candidate.summary?.trim(),
    !!candidate.default_pitch?.trim(),
    !!candidate.linkedin_url?.trim(),
    (candidate.salary_min != null || candidate.salary_max != null),
    !!candidate.availability?.trim(),
    (candidate.phone?.trim()?.length ?? 0) > 0,
    (candidate.location?.trim()?.length ?? 0) > 0,
    uploadedResumes.length > 0,
  ];
  const profileCompleteCount = profileCompletenessItems.filter(Boolean).length;
  const profileCompletenessPct = Math.round((profileCompleteCount / profileCompletenessItems.length) * 100);

  const topUnappliedMatch = matches.find(m => !alreadyApplied.has(m.job_id) && canApply(m.fit_score));
  const offerCount = applications.filter((a: any) => a.status === 'offer').length;

  const quickWinTip = (() => {
    if (uploadedResumes.length < 2 && matches.length > 0) return 'Upload 2+ resume versions — we pick the best fit per job.';
    if (profileCompletenessPct < 80) return 'Complete your profile for better match quality and visibility.';
    if (applicationsThisWeek === 0 && topUnappliedMatch) return 'Apply within 48h of a match for better response rates.';
    if (interviewApps.length > 0) return 'Prep for interviews: add dates and notes on the Interviews page.';
    if (savedJobIds.size > 0 && savedMatches.some(m => !alreadyApplied.has(m.job_id))) return 'You have saved jobs ready to apply — check Matched Jobs.';
    if (matches.length > 0) return 'Strong matches (82+ ATS) are apply-ready. Focus there first.';
    return 'Complete your profile and add a resume to get personalized matches.';
  })();

  const TABS = [
    { key: 'overview' as const, label: 'Overview', icon: <TrendingUp size={14} /> },
    { key: 'matches' as const, label: 'Matched Jobs', icon: <Target size={14} />, count: availableMatches.length },
    { key: 'saved' as const, label: 'Saved', icon: <BookmarkCheck size={14} />, count: savedJobIds.size },
    { key: 'applications' as const, label: 'Applications', icon: <ClipboardList size={14} />, count: applications.length },
    { key: 'reminders' as const, label: 'Reminders', icon: <Bell size={14} />, count: reminders.length },
    { key: 'resumes' as const, label: 'My Resumes', icon: <FileText size={14} />, count: uploadedResumes.length },
  ];

  return (
    <div className="space-y-8">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      {/* ─── Hero: premium welcome + readiness ───────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface-900 via-surface-800 to-brand-900/90 px-4 sm:px-6 py-6 sm:py-8 lg:py-10 text-white shadow-xl border border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,80,200,0.2),transparent)]" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-brand-500/10 to-transparent" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6">
          <div className="flex-1">
            <p className="text-surface-300/90 text-xs font-semibold uppercase tracking-[0.2em] mb-2">{dateStr}</p>
            <h1 className="text-xl sm:text-3xl lg:text-4xl font-bold font-display tracking-tight text-white drop-shadow-sm">
              {greeting}, {firstName}
            </h1>
            <p className="text-surface-300 mt-1.5 text-sm sm:text-base">
              <span className="text-surface-400">Job title: </span>
              {candidate.primary_title?.trim() ? (
                <span>{candidate.primary_title}</span>
              ) : (
                <a href="/dashboard/candidate/profile" className="underline hover:text-white">Add in My profile →</a>
              )}
              {candidate.location ? ` · ${candidate.location}` : ''}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/10">
                  <div className="w-12 h-1.5 rounded-full bg-white/20 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${profileCompletenessPct}%` }} />
                  </div>
                  <span className="text-xs font-bold tabular-nums text-white/90">{profileCompletenessPct}%</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/90">Profile strength</p>
                  <p className="text-[10px] text-surface-400">Better profile = better matches</p>
                </div>
              </div>
              {applicationsThisWeek > 0 && (
                <div className="h-8 w-px bg-white/20 hidden sm:block" />
              )}
              {applicationsThisWeek > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30">
                  <Zap size={12} className="text-emerald-300" />
                  <span className="text-xs font-semibold text-emerald-100">{applicationsThisWeek} application{applicationsThisWeek !== 1 ? 's' : ''} this week</span>
                </div>
              )}
              {applicationUsage != null && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10">
                  <ClipboardList size={12} className="text-white/80" />
                  <span className="text-xs font-semibold text-white/90">
                    {applicationUsage.used_today} of {applicationUsage.limit} applications today
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button onClick={load} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors" title="Refresh">
              <RefreshCw size={18} />
            </button>
            <button onClick={handleExportData} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium">
              <FileDown size={16} /> Export data
            </button>
            <button onClick={() => setTab('matches')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-surface-900 font-semibold text-sm shadow-lg hover:bg-surface-50 hover:shadow-xl transition-all">
              <Target size={18} /> Matched Jobs
            </button>
          </div>
        </div>
      </div>

      {/* ─── Recommended next step ───────────────────────────────────────────── */}
      {(topUnappliedMatch || (!uploadedResumes.length && matches.length > 0) || profileCompletenessPct < 80) && (
        <div className="rounded-2xl border border-brand-200 dark:border-brand-500/40 bg-gradient-to-r from-brand-50 to-white dark:from-brand-500/10 dark:to-surface-800 px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 sm:gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 dark:bg-brand-500/30 flex items-center justify-center shrink-0">
              <Sparkles size={20} className="text-brand-600 dark:text-brand-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand-700 dark:text-brand-300 uppercase tracking-wide">Recommended next step</p>
              <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
                {topUnappliedMatch
                  ? `Apply to ${topUnappliedMatch.job?.title} at ${topUnappliedMatch.job?.company}`
                  : !uploadedResumes.length && matches.length > 0
                    ? 'Upload a resume to get accurate ATS scores for every match'
                    : 'Complete your profile to improve match quality'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {topUnappliedMatch && (
              <>
                <button onClick={() => openConfirmApplied(topUnappliedMatch.job_id)} disabled={applying === topUnappliedMatch.job_id} className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5">
                  {applying === topUnappliedMatch.job_id ? <Spinner size={14} /> : <><CheckCircle2 size={14} /> Confirm applied</>}
                </button>
                {topUnappliedMatch.job?.url && (
                  <a href={topUnappliedMatch.job.url} target="_blank" rel="noreferrer" className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5">
                    <ExternalLink size={14} /> Apply
                  </a>
                )}
              </>
            )}
            {!uploadedResumes.length && matches.length > 0 && (
              <button onClick={() => setTab('resumes')} className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5">
                <Upload size={14} /> Upload resume
              </button>
            )}
            {profileCompletenessPct < 80 && uploadedResumes.length > 0 && !topUnappliedMatch && (
              <a href="/dashboard/candidate/profile" className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5">
                <User size={14} /> Complete profile
              </a>
            )}
          </div>
        </div>
      )}

      {/* ─── Quick stats ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Matched Jobs" value={matches.length} icon={<Briefcase size={22} className="text-brand-600 dark:text-brand-400" />} color="bg-brand-500/10 dark:bg-brand-500/20" subtext={applicationsThisWeek > 0 ? `${applicationsThisWeek} applied this week` : undefined} />
        <StatCard label="Applications" value={applications.length} icon={<ClipboardList size={22} className="text-violet-600 dark:text-violet-400" />} color="bg-violet-500/10 dark:bg-violet-500/20" />
        <StatCard label="Strong matches" value={interviewPossible} icon={<Star size={22} className="text-emerald-600 dark:text-emerald-400" />} color="bg-emerald-500/10 dark:bg-emerald-500/20" subtext="82+ ATS · apply ready" />
        <StatCard label="Avg ATS score" value={avgScore || '—'} icon={<TrendingUp size={22} className="text-amber-600 dark:text-amber-400" />} color="bg-amber-500/10 dark:bg-amber-500/20" />
      </div>

      {/* New matches highlight */}
      {newMatchesCount > 0 && (
        <div className="rounded-xl border border-brand-200 dark:border-brand-500/40 bg-gradient-to-r from-brand-50 to-white dark:from-brand-500/10 dark:to-surface-800 px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-medium text-brand-900 dark:text-brand-200">
            <Sparkles size={16} className="inline mr-2 text-brand-500" />
            {newMatchesCount} new match{newMatchesCount !== 1 ? 'es' : ''} since your last visit
          </p>
          <button onClick={() => setTab('matches')} className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">View matches</button>
        </div>
      )}

      {/* ─── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 sm:gap-1.5 p-1 rounded-2xl bg-surface-100 dark:bg-surface-800/80 border border-surface-200 dark:border-surface-700 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap rounded-xl transition-all',
              tab === t.key
                ? 'bg-white dark:bg-surface-700 text-brand-700 dark:text-brand-300 shadow-sm border border-surface-200 dark:border-surface-600'
                : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200 hover:bg-white/50 dark:hover:bg-surface-700/50'
            )}>
            {t.icon}
            {t.label}
            {'count' in t && t.count !== undefined && t.count > 0 && (
              <span className={cn('px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums',
                tab === t.key ? 'bg-brand-100 dark:bg-brand-500/30 text-brand-700 dark:text-brand-200' : 'bg-surface-200 dark:bg-surface-600 text-surface-600 dark:text-surface-300')}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-8">
          {/* Pipeline funnel: Matched → Saved → Applied → Interview → Offer */}
          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center"><Target size={16} className="text-violet-600 dark:text-violet-400" /></span>
                Your pipeline
              </h3>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">Track your progress from match to offer</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-0">
              {[
                { label: 'Matched', count: matches.length, icon: Briefcase },
                { label: 'Saved', count: savedJobIds.size, icon: BookmarkCheck },
                { label: 'Applied', count: applications.length, icon: ClipboardList },
                { label: 'Interview', count: interviewApps.length, icon: Calendar },
                { label: 'Offer', count: offerCount, icon: Award },
              ].map((step, i) => (
                <div key={step.label} className="flex items-center">
                  <div className="flex flex-col items-center gap-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-surface-50 dark:bg-surface-700/50 border border-surface-100 dark:border-surface-600 min-w-[4.5rem] sm:min-w-[5rem]">
                    <step.icon size={14} className="text-surface-500 dark:text-surface-400 shrink-0" />
                    <span className="text-lg font-bold text-surface-900 dark:text-surface-100 tabular-nums">{step.count}</span>
                    <span className="text-[10px] font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">{step.label}</span>
                  </div>
                  {i < 4 && <ArrowRight size={14} className="text-surface-300 dark:text-surface-500 mx-1 sm:mx-2 shrink-0 hidden sm:block" />}
                </div>
              ))}
            </div>
          </div>

          {/* This week + Quick win */}
          <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-surface-100 dark:divide-surface-700">
              <div className="px-5 py-4 bg-surface-50/50 dark:bg-surface-700/30">
                <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-2">This week</p>
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums">{applicationsThisWeek}</p>
                <p className="text-sm text-surface-600 dark:text-surface-300">application{applicationsThisWeek !== 1 ? 's' : ''} submitted</p>
                {newMatchesCount > 0 && (
                  <p className="text-xs text-brand-600 dark:text-brand-400 mt-1.5 font-medium">{newMatchesCount} new match{newMatchesCount !== 1 ? 'es' : ''} since last visit</p>
                )}
              </div>
              <div className="px-5 py-4 flex flex-col justify-center">
                <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Lightbulb size={12} className="text-amber-500" /> Quick win
                </p>
                <p className="text-sm text-surface-700 dark:text-surface-200 leading-snug">{quickWinTip}</p>
              </div>
            </div>
          </div>

          {/* ATS distribution */}
          {matches.length > 0 && (
            <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-brand-500/10 dark:bg-brand-500/20 flex items-center justify-center"><Zap size={16} className="text-brand-600 dark:text-brand-400" /></span>
                  Your ATS score distribution
                </h3>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">See how your matches stack up — aim for 82+ for strong fit.</p>
              </div>
              <div className="flex items-end gap-1.5 h-20 mb-4">
                {[
                  { from: 0, to: 40 }, { from: 40, to: 50 }, { from: 50, to: 60 },
                  { from: 60, to: 70 }, { from: 70, to: 80 }, { from: 80, to: 90 }, { from: 90, to: 101 }
                ].map(({ from, to }, i) => {
                  const count = matches.filter(m => m.fit_score >= from && m.fit_score < to).length;
                  const max = Math.max(1, ...([0,40,50,60,70,80,90].map((f, j, arr) =>
                    matches.filter(m => m.fit_score >= f && m.fit_score < (arr[j+1] || 101)).length
                  )));
                  const height = Math.max(6, (count / max) * 64);
                  const barColor = to >= SCORE_APPLY_OK ? 'bg-emerald-500' : to >= SCORE_APPLY_CAUTION ? 'bg-amber-500' : 'bg-red-400';
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-medium text-surface-500 dark:text-surface-400 tabular-nums">{count || ''}</span>
                      <div className={cn('w-full rounded-t-lg transition-all', barColor)} style={{ height }} />
                      <span className="text-[9px] text-surface-400 dark:text-surface-500">{from}+</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-6 text-xs flex-wrap">
                <span className="flex items-center gap-1.5 text-surface-600 dark:text-surface-300"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Strong match (82+)</span>
                <span className="flex items-center gap-1.5 text-surface-600 dark:text-surface-300"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />Apply with caution (75–81)</span>
                <span className="flex items-center gap-1.5 text-surface-600 dark:text-surface-300"><span className="w-2.5 h-2.5 rounded-full bg-red-400" />Cannot apply (&lt;75)</span>
              </div>
            </div>
          )}

          {/* Top matches + Recent applications row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {matches.length > 0 && (
              <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-700 flex items-center justify-between bg-surface-50/50 dark:bg-surface-700/30">
                  <div>
                    <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center"><Sparkles size={16} className="text-emerald-600 dark:text-emerald-400" /></span>
                      Top matches
                    </h3>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Your highest-scoring opportunities</p>
                  </div>
                  <button onClick={() => setTab('matches')} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 shrink-0">
                    View all <ChevronRight size={12} />
                  </button>
                </div>
                <div className="divide-y divide-surface-100 dark:divide-surface-700">
                  {availableMatches.slice(0, 5).map(m => {
                    const reason = parseMatchReason(m.match_reason);
                    const applied = alreadyApplied.has(m.job_id);
                    return (
                      <div key={m.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-surface-50/80 dark:hover:bg-surface-700/50 transition-colors">
                        <ATSScoreBadge score={m.fit_score} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">{m.job?.title}</p>
                          <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{m.job?.company} · {m.job?.location || '—'}</p>
                          {reason.strength && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">✓ {reason.strength}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          <button onClick={() => { setBriefJobId(m.job_id); setBriefText(null); setBriefError(null); generateJobBrief(m.job_id); }} disabled={briefLoading && briefJobId === m.job_id} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-brand-600 dark:hover:text-brand-400" title="AI brief">
                            {briefLoading && briefJobId === m.job_id ? <Spinner size={14} /> : <Brain size={14} />}
                          </button>
                          {applied
                            ? <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Applied</span>
                            : (() => {
                                const allowApply = canApply(m.fit_score);
                                return (
                                  <>
                                    <button onClick={() => toggleSavedJob(m.job_id)} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-brand-600 dark:hover:text-brand-400" title={savedJobIds.has(m.job_id) ? 'Unsave' : 'Save for later'}>
                                      {savedJobIds.has(m.job_id) ? <BookmarkCheck size={14} className="text-brand-600 dark:text-brand-400" /> : <Bookmark size={14} />}
                                    </button>
                                    {m.job?.url ? (
                                      <a href={m.job.url} target="_blank" rel="noreferrer" className={cn('btn-primary text-xs py-1.5 px-3 flex items-center gap-1', !allowApply && 'opacity-50 pointer-events-none')} title={!allowApply ? 'Score must be 75+ to apply' : undefined}>
                                        <ExternalLink size={12} /> Apply
                                      </a>
                                    ) : <span className="text-xs text-surface-400 dark:text-surface-500 px-2">No link</span>}
                                    <button onClick={() => openConfirmApplied(m.job_id)} disabled={applying === m.job_id || !allowApply}
                                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1" title={!allowApply ? 'Score must be 75+ to apply' : undefined}>
                                      {applying === m.job_id ? <Spinner size={12} /> : <><CheckCircle2 size={12} /> Confirm</>}
                                    </button>
                                  </>
                                );
                              })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {applications.length > 0 && (
              <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-700 flex items-center justify-between bg-surface-50/50 dark:bg-surface-700/30">
                  <div>
                    <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center"><ClipboardList size={16} className="text-violet-600 dark:text-violet-400" /></span>
                      Recent applications
                    </h3>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Track status and follow up</p>
                  </div>
                  <button onClick={() => setTab('applications')} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 shrink-0">
                    View all <ChevronRight size={12} />
                  </button>
                </div>
                <div className="divide-y divide-surface-100 dark:divide-surface-700">
                  {applications.slice(0, 4).map(a => (
                    <div key={a.id} className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-surface-50/80 dark:hover:bg-surface-700/50 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">{a.job?.title}</p>
                        <p className="text-xs text-surface-500 dark:text-surface-400">{a.job?.company}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <StatusBadge status={a.status} />
                        <span className="text-xs text-surface-400 dark:text-surface-500">{formatRelative(a.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Upload nudge */}
          {uploadedResumes.length === 0 && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-500/40 bg-gradient-to-br from-amber-50 to-white dark:from-amber-500/10 dark:to-surface-800 p-6 flex items-start gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 dark:bg-amber-500/30 flex items-center justify-center shrink-0">
                <Upload size={22} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Upload your resume to improve ATS scores</p>
                <p className="text-xs text-amber-700 dark:text-amber-300/90 mt-1">
                  Our AI reads your full resume to score matches more accurately. Without it, scoring uses only your profile.
                </p>
                <button onClick={() => setTab('resumes')} className="mt-4 btn-primary text-sm py-2 px-4 flex items-center gap-2 w-fit">
                  <Upload size={16} /> Upload resume
                </button>
              </div>
            </div>
          )}

          {/* Activity timeline */}
          {(applications.length > 0 || matches.length > 0) && (
            <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-surface-200 dark:bg-surface-600 flex items-center justify-center"><Calendar size={16} className="text-surface-600 dark:text-surface-300" /></span>
                  Recent activity
                </h3>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">Your latest matches and applications</p>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {[
                  ...applications.map((a: any) => ({ type: 'application' as const, at: a.applied_at || a.updated_at, app: a })),
                  ...matches.slice(0, 10).map((m: any) => ({ type: 'match' as const, at: m.matched_at || m.created_at, match: m })),
                ]
                  .filter(x => x.at)
                  .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                  .slice(0, 12)
                  .map((item, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className="text-surface-400 dark:text-surface-500 text-xs shrink-0 w-20">{formatRelative(item.at)}</span>
                      {item.type === 'application'
                        ? <span className="text-surface-700 dark:text-surface-200">Applied to <strong>{item.app.job?.title}</strong> at {item.app.job?.company}</span>
                        : <span className="text-surface-700 dark:text-surface-200">New match: <strong>{item.match.job?.title}</strong> at {item.match.job?.company} ({item.match.fit_score})</span>
                      }
                    </div>
                  ))}
              </div>
            </div>
          )}

          {matches.length === 0 && applications.length === 0 && (
            <EmptyState icon={<Target size={24} />} title="Your pipeline is getting ready"
              description="Your recruiter is curating the best roles for you. Complete your profile and check back soon — new matches will appear here." />
          )}
        </div>
      )}

      {/* ── MATCHES ── */}
      {tab === 'matches' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-surface-500 dark:text-surface-400">Match date:</span>
              {(['all', '7', '30', '90'] as const).map(f => (
                <button key={f} onClick={() => setMatchDateFilter(f)}
                  className={cn('text-sm font-medium py-1.5 px-3 rounded-lg transition-colors', matchDateFilter === f ? 'bg-brand-600 text-white' : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600')}>
                  {f === 'all' ? 'All' : `Last ${f} days`}
                </button>
              ))}
            </div>
            <button onClick={() => setShowSavedOnly(!showSavedOnly)} className={cn('text-sm font-medium py-2 px-4 rounded-xl transition-colors', showSavedOnly ? 'bg-brand-100 dark:bg-brand-500/30 text-brand-700 dark:text-brand-200' : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600')}>
              <BookmarkCheck size={14} className="inline mr-1.5" /> Saved only
            </button>
          </div>
          {filteredAvailableForSaved.length === 0 ? (
            <EmptyState icon={<Briefcase size={24} />} title={showSavedOnly ? 'No saved jobs' : 'No matches yet'}
              description={showSavedOnly ? 'Save jobs from the list to see them here.' : availableMatches.length === 0 ? "You've applied to all matched jobs, or no matches yet. Check Applications for status." : 'No matches in this date range.'} />
          ) : filteredAvailableForSaved.map(m => {
            const reason = parseMatchReason(m.match_reason);
            const applied = alreadyApplied.has(m.job_id);
            const appStatus = applications.find(a => a.job_id === m.job_id)?.status;
            return (
              <div key={m.id} className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-5 space-y-4 shadow-sm">
                <div className="flex items-start gap-4 flex-wrap">
                  <ATSScoreBadge score={m.fit_score} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-semibold text-surface-900 dark:text-surface-100 text-lg">{m.job?.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-surface-500 dark:text-surface-400">
                          <span>{m.job?.company}</span>
                          {m.job?.location && <span className="flex items-center gap-0.5"><MapPin size={10} />{m.job.location}</span>}
                          {m.job?.remote_type && <span className="capitalize">{m.job.remote_type}</span>}
                          {m.job?.salary_min && (
                            <span>${Math.round(m.job.salary_min / 1000)}k{m.job.salary_max ? `–$${Math.round(m.job.salary_max / 1000)}k` : '+'}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {applied
                          ? <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium px-3 py-1.5 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-xl">
                              <CheckCircle2 size={12} /> {appStatus || 'Applied'}
                            </span>
                          : (() => {
                              const allowApply = canApply(m.fit_score);
                              return (
                                <>
                                  <button onClick={() => toggleSavedJob(m.job_id)} className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-brand-600 dark:hover:text-brand-400" title={savedJobIds.has(m.job_id) ? 'Unsave' : 'Save for later'}>
                                    {savedJobIds.has(m.job_id) ? <BookmarkCheck size={16} className="text-brand-600 dark:text-brand-400" /> : <Bookmark size={16} />}
                                  </button>
                                  <button onClick={() => { setBriefJobId(m.job_id); setBriefText(null); setBriefError(null); generateJobBrief(m.job_id); }} disabled={briefLoading && briefJobId === m.job_id} className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-brand-600 dark:hover:text-brand-400" title="AI brief: why this score, what matched, what to improve">
                                    {briefLoading && briefJobId === m.job_id ? <Spinner size={16} /> : <Brain size={16} />}
                                  </button>
                                  {m.job?.url ? (
                                    <a href={m.job.url} target="_blank" rel="noreferrer" className={cn('btn-primary text-xs py-2 px-4 flex items-center gap-1.5', !allowApply && 'opacity-50 pointer-events-none')} title={!allowApply ? 'Score must be 75+ to apply' : undefined}>
                                      <ExternalLink size={12} /> Apply now
                                    </a>
                                  ) : (
                                    <span className="text-xs text-surface-400 dark:text-surface-500 px-2">No application link</span>
                                  )}
                                  <button onClick={() => openConfirmApplied(m.job_id)} disabled={applying === m.job_id || !allowApply}
                                    className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5" title={!allowApply ? 'Score must be 75+ to apply' : undefined}>
                                    {applying === m.job_id ? <Spinner size={12} /> : <><CheckCircle2 size={12} /> Confirm applied</>}
                                  </button>
                                </>
                              );
                            })()
                        }
                        {(() => {
                          const tr = tailoredResumes[m.job_id];
                          const status = tr?.generation_status;
                          // Candidates can only download recruiter-generated tailored resumes;
                          // they cannot trigger or retry generation themselves.
                          if (status === 'done' || status === 'completed') {
                            return (
                              <button
                                onClick={() => downloadTailoredResume(tr.pdf_path, m.job?.title || 'Job')}
                                className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                              >
                                <Download size={12} /> Download Tailored Resume
                              </button>
                            );
                          }
                          if (['pending', 'generating', 'compiling', 'uploading'].includes(status)) {
                            return (
                              <span className="inline-flex items-center gap-1.5 text-xs py-2 px-4 text-brand-600 dark:text-brand-400 font-medium">
                                <Spinner size={12} /> Recruiter is tailoring your resume…
                              </span>
                            );
                          }
                          // No button when there is no tailored resume yet or it failed;
                          // candidates must rely on recruiters to trigger tailoring.
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {m.fit_score >= SCORE_APPLY_CAUTION && m.fit_score < SCORE_APPLY_OK && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/20 rounded-lg px-3 py-2">
                    ⚠ Moderate match — you can apply with caution.
                  </p>
                )}
                {m.fit_score < SCORE_APPLY_CAUTION && (
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 dark:bg-red-500/20 rounded-lg px-3 py-2">
                    Score below 75 — applying is not recommended.
                  </p>
                )}

                {(m.score_breakdown?.version === 2 || m.score_breakdown?.version === 3) && m.score_breakdown.dimensions && (
                  <div className="pt-3 border-t border-surface-100 dark:border-surface-700 space-y-2.5">
                    <p className="text-[11px] font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">ATS Score Breakdown {m.score_breakdown.version === 3 ? '(v3 — Elite)' : ''}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                      {[
                        { key: 'keyword', label: 'Keywords', icon: '🔑' },
                        { key: 'experience', label: 'Experience', icon: '💼' },
                        { key: 'title', label: 'Role Fit', icon: '🎯' },
                        { key: 'education', label: 'Education', icon: '🎓' },
                        { key: 'location', label: 'Location', icon: '📍' },
                        { key: 'formatting', label: 'ATS Format', icon: '📄' },
                        { key: 'behavioral', label: 'Behavioral', icon: '🤝' },
                        { key: 'soft', label: 'Soft Factors', icon: '✨' },
                      ].map(dim => {
                        const d = m.score_breakdown.dimensions[dim.key];
                        if (!d) return null;
                        const dimWeight = m.score_breakdown.weights?.[dim.key];
                        const barColor = d.score >= 80 ? 'bg-emerald-500' : d.score >= 60 ? 'bg-amber-500' : d.score >= 40 ? 'bg-orange-500' : 'bg-red-500';
                        return (
                          <div key={dim.key} className="flex items-center gap-2 group" title={d.details}>
                            <span className="text-[10px] w-3 shrink-0">{dim.icon}</span>
                            <span className="text-[10px] text-surface-500 dark:text-surface-400 w-16 shrink-0 truncate">{dim.label}</span>
                            <div className="flex-1 h-2 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
                              <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${d.score}%` }} />
                            </div>
                            <span className={cn('text-[10px] font-bold tabular-nums w-7 text-right', d.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : d.score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400')}>{d.score}</span>
                            {dimWeight && <span className="text-[8px] text-surface-400 w-5 shrink-0">{dimWeight}%</span>}
                          </div>
                        );
                      })}
                    </div>
                    {m.score_breakdown.dimensions.keyword?.matched?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.score_breakdown.dimensions.keyword.matched.slice(0, 8).map((k: string, i: number) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">{k}</span>
                        ))}
                        {m.score_breakdown.dimensions.keyword.missing?.slice(0, 4).map((k: string, i: number) => (
                          <span key={`m${i}`} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 line-through">{k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!m.score_breakdown?.dimensions && (reason.strength || reason.gap || reason.risk) && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-surface-100 dark:border-surface-700">
                    {reason.strength && (
                      <div className="flex items-start gap-2 text-xs rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 px-3 py-2">
                        <span className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0">✓</span>
                        <span className="text-surface-700 dark:text-surface-200"><span className="font-semibold text-emerald-700 dark:text-emerald-300">Strength: </span>{reason.strength}</span>
                      </div>
                    )}
                    {reason.gap && (
                      <div className="flex items-start gap-2 text-xs rounded-lg bg-amber-500/10 dark:bg-amber-500/20 px-3 py-2">
                        <span className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0">△</span>
                        <span className="text-surface-700 dark:text-surface-200"><span className="font-semibold text-amber-700 dark:text-amber-300">Gap: </span>{reason.gap}</span>
                      </div>
                    )}
                    {reason.risk && reason.risk !== 'None' && (
                      <div className="flex items-start gap-2 text-xs rounded-lg bg-red-500/10 dark:bg-red-500/20 px-3 py-2">
                        <span className="text-red-500 dark:text-red-400 mt-0.5 shrink-0">⚠</span>
                        <span className="text-surface-700 dark:text-surface-200"><span className="font-semibold text-red-600 dark:text-red-300">Risk: </span>{reason.risk}</span>
                      </div>
                    )}
                  </div>
                )}

                {m.score_breakdown?.variant_scores && m.score_breakdown.variant_scores.length > 1 && (
                  <div className="pt-3 border-t border-surface-100 dark:border-surface-700 space-y-2">
                    <p className="text-[11px] font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide flex items-center gap-1">
                      <FileText size={10} /> Score per resume
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {m.score_breakdown.variant_scores.map((vs: any, vi: number) => {
                        const rLabel = vs.resume_id
                          ? (uploadedResumes.find((r: any) => r.id === vs.resume_id)?.label || `Resume ${vi + 1}`)
                          : 'Profile only';
                        const isBest = vs.resume_id === m.best_resume_id;
                        const { bg, text: textCls } = getScoreBadgeClasses(vs.score);
                        return (
                          <div key={vi} className={cn('flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs border', isBest ? 'border-brand-300 dark:border-brand-500/50 bg-brand-50/50 dark:bg-brand-500/10' : 'border-surface-150 dark:border-surface-700 bg-surface-50 dark:bg-surface-800')}>
                            <span className={cn('font-bold tabular-nums w-8 text-center px-1.5 py-0.5 rounded-lg', bg, textCls)}>{vs.score}</span>
                            <span className="text-surface-700 dark:text-surface-200 font-medium truncate flex-1">{rLabel}</span>
                            {isBest && <span className="text-[9px] font-semibold text-brand-600 dark:text-brand-400 bg-brand-100 dark:bg-brand-500/20 px-1.5 py-0.5 rounded-md uppercase">Best</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {m.score_breakdown?.variant_scores?.length === 1 && m.best_resume_id && (
                  <p className="text-[10px] text-surface-400 dark:text-surface-500 flex items-center gap-1">
                    <FileText size={10} />
                    Scored with: {uploadedResumes.find((r: any) => r.id === m.best_resume_id)?.label || 'your resume'}
                  </p>
                )}

                {!m.score_breakdown?.variant_scores && m.best_resume_id && (
                  <p className="text-[10px] text-surface-400 dark:text-surface-500 flex items-center gap-1">
                    <FileText size={10} />
                    Best match used: {uploadedResumes.find((r: any) => r.id === m.best_resume_id)?.label || 'your resume'}
                  </p>
                )}

                {(m.matched_keywords?.length || m.missing_keywords?.length) ? (
                  <div className="flex flex-wrap gap-2">
                    {m.matched_keywords?.slice(0, 5).map((k: string, i: number) => (
                      <span key={i} className="px-2 py-1 bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 rounded-lg text-[11px] font-medium">✓ {k}</span>
                    ))}
                    {m.missing_keywords?.slice(0, 4).map((k: string, i: number) => (
                      <span key={i} className="px-2 py-1 bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-300 rounded-lg text-[11px] font-medium">✗ {k}</span>
                    ))}
                  </div>
                ) : null}
                {reason.resume && (
                  <p className="text-[10px] text-surface-400 dark:text-surface-500 italic">Scored using: {reason.resume}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── SAVED (bookmarked jobs) ── */}
      {tab === 'saved' && (
        <div className="space-y-4">
          {savedMatches.length === 0 ? (
            <EmptyState icon={<Bookmark size={24} />} title="No saved jobs"
              description="Save jobs from Matched Jobs to see them here. Use the bookmark icon on any match."
              action={<button onClick={() => setTab('matches')} className="btn-primary text-sm py-2 px-4">Browse matches</button>}
            />
          ) : (
            <p className="text-sm text-surface-500 dark:text-surface-400">{savedMatches.length} saved job{savedMatches.length !== 1 ? 's' : ''}</p>
          )}
          {savedMatches.length > 0 && savedMatches.map(m => {
            const reason = parseMatchReason(m.match_reason);
            const applied = alreadyApplied.has(m.job_id);
            const appStatus = applications.find(a => a.job_id === m.job_id)?.status;
            return (
              <div key={m.id} className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-5 space-y-4 shadow-sm">
                <div className="flex items-start gap-4 flex-wrap">
                  <ATSScoreBadge score={m.fit_score} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-semibold text-surface-900 dark:text-surface-100 text-lg">{m.job?.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-surface-500 dark:text-surface-400">
                          <span>{m.job?.company}</span>
                          {m.job?.location && <span className="flex items-center gap-0.5"><MapPin size={10} />{m.job.location}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button onClick={() => toggleSavedJob(m.job_id)} className="p-2 rounded-xl bg-brand-100 dark:bg-brand-500/30 text-brand-600 dark:text-brand-300" title="Unsave">
                          <BookmarkCheck size={16} />
                        </button>
                        <button onClick={() => { setBriefJobId(m.job_id); setBriefText(null); setBriefError(null); generateJobBrief(m.job_id); }} disabled={briefLoading && briefJobId === m.job_id} className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-brand-600 dark:hover:text-brand-400" title="AI brief">
                          {briefLoading && briefJobId === m.job_id ? <Spinner size={16} /> : <Brain size={16} />}
                        </button>
                        {applied ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium px-3 py-1.5 bg-emerald-500/10 rounded-xl">
                            <CheckCircle2 size={12} /> {appStatus || 'Applied'}
                          </span>
                        ) : (() => {
                            const allowApply = canApply(m.fit_score);
                            return (
                              <>
                                {m.job?.url && (
                                  <a href={m.job.url} target="_blank" rel="noreferrer" className={cn('btn-primary text-xs py-2 px-4 flex items-center gap-1.5', !allowApply && 'opacity-50 pointer-events-none')} title={!allowApply ? 'Score must be 75+ to apply' : undefined}>
                                    <ExternalLink size={12} /> Apply now
                                  </a>
                                )}
                                <button onClick={() => openConfirmApplied(m.job_id)} disabled={applying === m.job_id || !allowApply} className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5" title={!allowApply ? 'Score must be 75+ to apply' : undefined}>
                                  {applying === m.job_id ? <Spinner size={12} /> : <><CheckCircle2 size={12} /> Confirm applied</>}
                                </button>
                              </>
                            );
                          })()
                        }
                      </div>
                    </div>
                  </div>
                </div>
                {(reason.strength || reason.gap) && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-surface-100 dark:border-surface-700">
                    {reason.strength && <span className="text-xs text-emerald-700 dark:text-emerald-300">✓ {reason.strength}</span>}
                    {reason.gap && <span className="text-xs text-amber-700 dark:text-amber-300">△ {reason.gap}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── APPLICATIONS ── */}
      {tab === 'applications' && (
        <div className="space-y-4">
          {applications.length === 0 ? (
            <EmptyState icon={<ClipboardList size={24} />} title="No applications yet"
              description="Apply to matched jobs from the Matched Jobs tab, then confirm applied here." />
          ) : applications.map(a => (
            <div key={a.id} className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-5 space-y-4 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-surface-900 dark:text-surface-100 text-lg">{a.job?.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-surface-500 dark:text-surface-400 flex-wrap">
                    <span>{a.job?.company}</span>
                    {a.job?.location && <span className="flex items-center gap-0.5"><MapPin size={10} />{a.job.location}</span>}
                  </div>
                  <p className="text-xs text-surface-400 dark:text-surface-500 mt-1">
                    Applied {a.applied_at ? formatDate(a.applied_at) : formatRelative(a.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={a.status} />
                  {a.job?.url && (
                    <a href={a.job.url} target="_blank" rel="noreferrer" className="btn-ghost p-2 rounded-xl" title="Open job">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>

              {/* Private note */}
              <div className="pt-3 border-t border-surface-100 dark:border-surface-700">
                <label className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Private note</label>
                <textarea value={a.candidate_notes || ''} onChange={e => { const v = e.target.value; updateApplicationNotes(a.id, v); setApplications(prev => prev.map(x => x.id === a.id ? { ...x, candidate_notes: v } : x)); }}
                  className="input text-sm mt-1.5 min-h-[72px] w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400" placeholder="Your private note for this application" />
              </div>

              {/* Interview block (when status is interview) */}
              {a.status === 'interview' && (
                <div className="pt-3 border-t border-surface-100 dark:border-surface-700 space-y-3">
                  <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">Interview</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs dark:text-surface-200">Date</label>
                      <input type="date" value={a.interview_date ? String(a.interview_date).slice(0, 10) : ''} onChange={e => updateApplicationInterview(a.id, e.target.value || null, a.interview_notes || '')} className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100" />
                    </div>
                    <div className="sm:col-span-2 sm:col-start-1">
                      <label className="label text-xs dark:text-surface-200">Notes</label>
                      <textarea value={a.interview_notes || ''} onChange={e => updateApplicationInterview(a.id, a.interview_date || null, e.target.value)} className="input text-sm min-h-[60px] w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400" placeholder="Prep notes, follow-up, etc." />
                    </div>
                  </div>
                </div>
              )}

              {/* Remind me + upcoming reminders */}
              <div className="pt-3 border-t border-surface-100 dark:border-surface-700 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-surface-500 dark:text-surface-400">Remind me:</span>
                {[3, 7, 14].map(d => (
                  <button key={d} onClick={() => addReminder(a.id, d)} className="text-xs py-1.5 px-3 rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-700 dark:text-surface-200 hover:bg-surface-200 dark:hover:bg-surface-600">
                    In {d} days
                  </button>
                ))}
                {reminders.filter((r: any) => r.application_id === a.id).map((r: any) => (
                  <span key={r.id} className="inline-flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    <Bell size={12} /> {formatRelative(r.remind_at)}
                    <button onClick={() => removeReminder(r.id)} className="p-0.5 rounded hover:bg-amber-500/30 text-amber-600 dark:text-amber-400" aria-label="Remove reminder"><X size={12} /></button>
                  </span>
                ))}
              </div>

              {/* Status pipeline */}
              <div className="pt-4 border-t border-surface-100 dark:border-surface-700">
                <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-3">Pipeline</p>
                <div className="flex items-center">
                  {(['applied', 'screening', 'interview', 'offer'] as const).map((s, i, arr) => {
                    const statusOrder = ['applied', 'screening', 'interview', 'offer'];
                    const currentIdx = statusOrder.indexOf(a.status);
                    const isActive = i <= currentIdx && a.status !== 'rejected' && a.status !== 'withdrawn';
                    const isLast = i === arr.length - 1;
                    return (
                      <div key={s} className={cn('flex items-center', !isLast && 'flex-1')}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                            isActive ? 'bg-brand-600 dark:bg-brand-500 text-white' : 'bg-surface-100 dark:bg-surface-700')}>
                            {isActive ? <CheckCircle2 size={14} className="text-white" /> : <span className="text-[10px] font-medium text-surface-400 dark:text-surface-500">{i+1}</span>}
                          </div>
                          <span className="text-[10px] font-medium text-surface-500 dark:text-surface-400 capitalize whitespace-nowrap">{s}</span>
                        </div>
                        {!isLast && <div className={cn('flex-1 h-1 mx-2 -mt-4 rounded-full', isActive && i < currentIdx ? 'bg-brand-500 dark:bg-brand-400' : 'bg-surface-200 dark:bg-surface-600')} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── REMINDERS ── */}
      {tab === 'reminders' && (
        <div className="space-y-4">
          {reminders.length === 0 ? (
            <EmptyState icon={<Bell size={24} />} title="No upcoming reminders"
              description="Add reminders from any application (e.g. “Remind me in 7 days”) to follow up on applications."
              action={<button onClick={() => setTab('applications')} className="btn-primary text-sm py-2 px-4">View applications</button>}
            />
          ) : (
            <>
              <p className="text-sm text-surface-500 dark:text-surface-400">{reminders.length} upcoming reminder{reminders.length !== 1 ? 's' : ''}</p>
              <div className="space-y-3">
                {reminders.map((r: any) => (
                  <div key={r.id} className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-surface-900 dark:text-surface-100">{r.application?.job?.title} at {r.application?.job?.company}</p>
                      <p className="text-xs text-surface-500 dark:text-surface-400 flex items-center gap-1 mt-0.5">
                        <Bell size={12} /> {formatRelative(r.remind_at)} · {formatDate(r.remind_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setTab('applications'); }} className="btn-ghost text-sm py-2 px-3">View application</button>
                      <button onClick={() => removeReminder(r.id)} className="p-2 rounded-xl hover:bg-red-500/10 text-surface-400 hover:text-red-600 dark:hover:text-red-400" title="Remove reminder"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {/* ── RESUMES ── */}
      {tab === 'resumes' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-surface-500 dark:text-surface-400">{uploadedResumes.length} / {MAX_RESUMES} resume variants</p>
            {uploadedResumes.length < MAX_RESUMES && (
              <button onClick={() => { setUploadError(null); setUploadLabel(''); setShowUploadModal(true); }}
                className="btn-primary text-sm flex items-center gap-2 py-2 px-4">
                <Plus size={16} /> Upload resume
              </button>
            )}
          </div>

          {uploadedResumes.length === 0 ? (
            <EmptyState icon={<Upload size={24} />} title="No resumes uploaded"
              description="Upload up to 5 PDF resume variants. The AI uses your resume for more accurate ATS scoring."
              action={<button onClick={() => setShowUploadModal(true)} className="btn-primary text-sm flex items-center gap-2 py-2 px-4"><Plus size={16} /> Upload resume</button>}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uploadedResumes.map(r => (
                <div key={r.id} className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-5 shadow-sm flex items-start justify-between gap-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center shrink-0">
                      <FileText size={20} className="text-red-600 dark:text-red-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">{r.label}</p>
                      <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{r.file_name}</p>
                      <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">{formatBytes(r.file_size)} · {formatRelative(r.uploaded_at)}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => downloadResume(r.pdf_path)} className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors" title="Download"><Download size={16} /></button>
                    <button onClick={() => setDeletingResume(r)} className="p-2 rounded-xl hover:bg-red-500/10 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors" title="Delete"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-brand-200 dark:border-brand-500/40 bg-gradient-to-br from-brand-50 to-white dark:from-brand-500/10 dark:to-surface-800 p-5 shadow-sm">
            <p className="text-sm font-bold text-brand-900 dark:text-brand-200 mb-1.5 flex items-center gap-1.5">💡 How resumes affect ATS scores</p>
            <p className="text-xs text-brand-700 dark:text-brand-300/90 leading-relaxed">
              When you upload a resume, our AI reads the full content and scores your fit against each job — giving you accurate ATS scores based on your actual resume. Upload multiple variants and the engine picks the best-scoring one per job.
            </p>
          </div>
        </div>
      )}

      {/* ── Upload Modal ── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl border border-surface-200 dark:border-surface-600 w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100 font-display">Upload resume PDF</h3>
              <button onClick={() => setShowUploadModal(false)} className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 dark:text-surface-400"><X size={18} /></button>
            </div>
            <div>
              <label className="label dark:text-surface-200">Label <span className="text-surface-400 dark:text-surface-500 font-normal text-xs">e.g. General, Data Eng v2</span></label>
              <input className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400" value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} placeholder="General Resume" />
            </div>
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors">
              {uploading ? (
                <div className="flex flex-col items-center gap-2"><Spinner size={22} /><p className="text-sm text-surface-500 dark:text-surface-400">Uploading...</p></div>
              ) : (
                <>
                  <Upload size={28} className="mx-auto text-surface-400 dark:text-surface-500 mb-2" />
                  <p className="text-sm font-medium text-surface-700 dark:text-surface-200">Click to select PDF</p>
                  <p className="text-xs text-surface-400 dark:text-surface-500 mt-1">PDF only · max 10MB</p>
                </>
              )}
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </div>
            {uploadError && <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle size={12} />{uploadError}</p>}
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deletingResume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl border border-surface-200 dark:border-surface-600 w-full max-w-sm p-6 space-y-5">
            <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100 font-display">Delete resume</h3>
            <p className="text-sm text-surface-600 dark:text-surface-300">Delete <strong className="text-surface-900 dark:text-surface-100">{deletingResume.label}</strong>? This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeletingResume(null)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleDeleteResume} disabled={deleting} className="btn-primary text-sm !bg-red-600 hover:!bg-red-700 !border-red-600">
                {deleting ? <Spinner size={14} /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Brief modal (per job) ── */}
      {briefJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl border border-surface-200 dark:border-surface-600 w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-700">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wide">AI brief</p>
                <p className="text-sm font-bold text-surface-900 dark:text-surface-100 truncate">
                  {matches.find(m => m.job_id === briefJobId)?.job?.title} · {matches.find(m => m.job_id === briefJobId)?.job?.company}
                </p>
              </div>
              <button onClick={() => { setBriefJobId(null); setBriefText(null); setBriefError(null); }} className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 dark:text-surface-400 shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {briefLoading && !briefText && <div className="flex items-center gap-2 text-surface-500 dark:text-surface-400"><Spinner size={18} /> Generating brief…</div>}
              {briefError && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{briefError}</p>}
              {briefText && <div className="text-sm text-surface-700 dark:text-surface-200 leading-relaxed whitespace-pre-wrap">{briefText}</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Applied modal ── */}
      {confirmAppliedJobId && (() => {
        const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
        const applicationsToday = applications.filter((a: any) => new Date(a.created_at) >= todayStart).length;
        const atDailyLimit = applicationsToday >= CANDIDATE_DAILY_APPLY_LIMIT;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl border border-surface-200 dark:border-surface-600 w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100 font-display">Confirm applied</h3>
              <button onClick={() => setConfirmAppliedJobId(null)} className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 dark:text-surface-400"><X size={18} /></button>
            </div>
            <p className="text-sm text-surface-600 dark:text-surface-300">Record this application and optionally choose which resume you used and add a private note.</p>
            <p className="text-xs text-surface-500 dark:text-surface-400">Applications today: {applicationsToday} / {CANDIDATE_DAILY_APPLY_LIMIT}</p>
            {applyError && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">{applyError}</p>
            )}
            {uploadedResumes.length > 0 && (
              <div>
                <label className="label dark:text-surface-200">Resume used (optional)</label>
                <select className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100" value={confirmResumeId || ''} onChange={e => setConfirmResumeId(e.target.value || null)}>
                  <option value="">— None selected —</option>
                  {uploadedResumes.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label dark:text-surface-200">Private note (optional)</label>
              <textarea className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 min-h-[80px]" value={confirmNotes} onChange={e => setConfirmNotes(e.target.value)} placeholder="e.g. Applied via company site, ref: John" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmAppliedJobId(null)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={() => applyToJob(confirmAppliedJobId, confirmResumeId, confirmNotes)} disabled={applying === confirmAppliedJobId || atDailyLimit} className="btn-primary text-sm" title={atDailyLimit ? `Daily limit (${CANDIDATE_DAILY_APPLY_LIMIT}) reached` : undefined}>
                {applying === confirmAppliedJobId ? <Spinner size={14} /> : 'Submit'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
