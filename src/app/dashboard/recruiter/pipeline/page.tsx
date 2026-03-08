'use client';
// src/app/dashboard/recruiter/pipeline/page.tsx
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient, subscribeWithLog } from '@/lib/supabase-browser';
import { Spinner, ToastContainer } from '@/components/ui';
import { useToast } from '@/hooks';
import { MapPin, Star, GripVertical, ExternalLink, Calendar } from 'lucide-react';
import { cn, formatDate } from '@/utils/helpers';
import { getScoreBadgeClasses } from '@/lib/ats-score';

const STAGES = [
  { key: 'ready', label: 'New Matches', color: 'bg-surface-100 dark:bg-surface-700/80', header: 'bg-surface-200 dark:bg-surface-600 text-surface-700 dark:text-surface-200' },
  { key: 'applied', label: 'Applied', color: 'bg-blue-50 dark:bg-blue-900/30', header: 'bg-blue-100 dark:bg-blue-800/60 text-blue-700 dark:text-blue-200' },
  { key: 'screening', label: 'Screening', color: 'bg-yellow-50 dark:bg-yellow-900/25', header: 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-200' },
  { key: 'interview', label: 'Interview', color: 'bg-brand-400/10 dark:bg-brand-400/10', header: 'bg-brand-400/10 text-brand-400' },
  { key: 'offer', label: 'Offer', color: 'bg-green-50 dark:bg-green-900/25', header: 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200' },
  { key: 'rejected', label: 'Rejected', color: 'bg-red-50 dark:bg-red-900/25', header: 'bg-red-100 dark:bg-red-800/50 text-red-600 dark:text-red-300' },
  { key: 'withdrawn', label: 'Withdrawn', color: 'bg-surface-100 dark:bg-surface-700/50', header: 'bg-surface-200 dark:bg-surface-600 text-surface-500 dark:text-surface-400' },
];

function scoreColor(score: number) {
  const { bg, text } = getScoreBadgeClasses(score);
  return `${bg} ${text}`;
}

export default function PipelinePage() {
  const [cards, setCards] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ card: any; fromStage: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const { toasts, toast, dismiss } = useToast();
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoadError('Not signed in');
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profile_roles')
      .select('company_id')
      .eq('id', session.user.id)
      .single();

    if (!profile?.company_id) {
      const empty: Record<string, any[]> = {};
      STAGES.forEach(s => empty[s.key] = []);
      setCards(empty);
      setLoading(false);
      return;
    }

    const { data: companyJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('company_id', profile.company_id);

    const jobIds = (companyJobs || []).map((j: any) => j.id);

    if (jobIds.length === 0) {
      const empty: Record<string, any[]> = {};
      STAGES.forEach(s => empty[s.key] = []);
      setCards(empty);
      setLoading(false);
      return;
    }

    const [appRes, matchRes] = await Promise.all([
      supabase.from('applications')
        .select('*, candidate:candidates(id, full_name, primary_title, location, rating), job:jobs(id, title, company, location, url)')
        .in('job_id', jobIds)
        .order('updated_at', { ascending: false }),
      supabase.from('candidate_job_matches')
        .select('*, candidate:candidates(id, full_name, primary_title, location, rating), job:jobs(id, title, company, location, url)')
        .in('job_id', jobIds)
        .gte('fit_score', 50)
        .order('fit_score', { ascending: false })
        .limit(50),
    ]);

    if (appRes.error || matchRes.error) {
      setLoadError(appRes.error?.message || matchRes.error?.message || 'Failed to load pipeline');
      setCards({});
      setLoading(false);
      return;
    }

    // Group applications by status
    const grouped: Record<string, any[]> = {};
    STAGES.forEach(s => grouped[s.key] = []);

    for (const app of appRes.data || []) {
      const stage = app.status || 'ready';
      if (grouped[stage]) grouped[stage].push({ ...app, _type: 'application' });
    }

    // Matches not yet applied → "ready" column
    const appliedKeys = new Set(
      (appRes.data || []).map((a: any) => `${a.candidate_id}:${a.job_id}`)
    );
    for (const m of matchRes.data || []) {
      const key = `${m.candidate_id}:${m.job_id}`;
      if (!appliedKeys.has(key)) {
        grouped['ready'].push({ ...m, _type: 'match' });
      }
    }

    setCards(grouped);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase unstable; load runs on mount and realtime
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('recruiter-pipeline')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidate_job_matches' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => load());
    subscribeWithLog(channel, 'recruiter-pipeline');
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase unstable; channel with load
  }, [load, supabase]);

  const moveCard = async (card: any, toStage: string) => {
    const cardId = card._type === 'match' ? `${card.candidate_id}:${card.job_id}` : card.id;
    setMovingCardId(cardId);
    try {
      if (card._type === 'match') {
        const res = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_id: card.candidate_id,
            job_id: card.job_id,
            status: toStage,
            applied_at: toStage === 'applied' ? new Date().toISOString() : null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(data.error || 'Failed to create application', 'error');
          return;
        }
      } else {
        const res = await fetch('/api/applications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: card.id, status: toStage }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(data.error || 'Failed to update status', 'error');
          return;
        }
      }
      await load();
    } catch (e: any) {
      toast(e.message || 'Failed to move card', 'error');
    } finally {
      setMovingCardId(null);
    }
  };

  const onDrop = async (toStage: string) => {
    if (!dragging || dragging.fromStage === toStage || movingCardId) {
      setDragging(null); setDragOver(null); return;
    }
    await moveCard(dragging.card, toStage);
    setDragging(null); setDragOver(null);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (loadError) {
    return (
      <div className="card p-12 text-center max-w-md mx-auto">
        <p className="text-surface-700 font-medium">Failed to load pipeline</p>
        <p className="text-sm text-surface-500 mt-1">{loadError}</p>
        <button type="button" onClick={() => load()} className="btn-primary mt-4">Try again</button>
      </div>
    );
  }

  const totalCards = Object.values(cards).reduce((sum, col) => sum + col.length, 0);

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">Pipeline Board</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          {totalCards} applications to your company&apos;s jobs · drag cards to update status
        </p>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[70vh]">
        {STAGES.map(stage => {
          const stageCards = cards[stage.key] || [];
          const isOver = dragOver === stage.key;

          return (
            <div
              key={stage.key}
              className={cn(
                'flex-shrink-0 w-64 rounded-xl flex flex-col transition-colors',
                stage.color,
                isOver && 'ring-2 ring-brand-400 dark:ring-brand-500'
              )}
              onDragOver={e => { e.preventDefault(); setDragOver(stage.key); }}
              onDragLeave={e => {
                // only clear if leaving the column entirely (not into a child)
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
              }}
              onDrop={() => onDrop(stage.key)}
            >
              {/* Column header */}
              <div className={cn('flex items-center justify-between px-3 py-2.5 rounded-t-xl text-xs font-semibold', stage.header)}>
                <span>{stage.label}</span>
                <span className="opacity-70">{stageCards.length}</span>
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {stageCards.map((card: any) => (
                  <PipelineCard
                    key={card.id || `${card.candidate_id}:${card.job_id}`}
                    card={card}
                    stage={stage.key}
                    disabled={!!movingCardId}
                    onDragStart={() => { if (!movingCardId) setDragging({ card, fromStage: stage.key }); }}
                    onMove={moveCard}
                  />
                ))}
                {stageCards.length === 0 && (
                  <div className={cn(
                    'h-16 rounded-lg border-2 border-dashed flex items-center justify-center text-xs',
                    isOver ? 'border-brand-400 dark:border-brand-500 text-brand-500 dark:text-brand-400' : 'border-surface-200 dark:border-surface-600 text-surface-300 dark:text-surface-500'
                  )}>
                    {isOver ? 'Drop here' : 'Empty'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineCard({ card, stage, disabled, onDragStart, onMove }: {
  card: any;
  stage: string;
  disabled?: boolean;
  onDragStart: () => void;
  onMove: (card: any, stage: string) => void;
}) {
  const candidate = card.candidate;
  const job = card.job;
  const isMatch = card._type === 'match';

  const NEXT_STAGE: Record<string, string | null> = {
    ready: 'applied', applied: 'screening', screening: 'interview',
    interview: 'offer', offer: null, rejected: null,
  };
  const NEXT_LABELS: Record<string, string> = {
    ready: '→ Apply', applied: '→ Screen', screening: '→ Interview', interview: '→ Offer',
  };
  const NEXT_COLORS: Record<string, string> = {
    ready: 'bg-blue-100 dark:bg-blue-800/60 text-blue-700 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-700/50',
    applied: 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-700/50',
    screening: 'bg-brand-400/10 text-brand-400 hover:bg-brand-400/20',
    interview: 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-700/50',
  };

  const nextStage = NEXT_STAGE[stage];

  return (
    <div
      draggable={!disabled}
      onDragStart={disabled ? undefined : onDragStart}
      className={cn(
        'bg-surface-100 rounded-xl p-3 shadow-sm border border-surface-100 dark:border-surface-600 hover:shadow-md transition-shadow group',
        disabled ? 'cursor-default opacity-75' : 'cursor-grab active:cursor-grabbing'
      )}
    >
      {/* Candidate row */}
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-500/25 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-xs shrink-0">
          {candidate?.full_name?.[0] || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/dashboard/recruiter/candidates/${card.candidate_id}`}
            className="text-xs font-semibold text-surface-900 dark:text-surface-100 hover:text-brand-600 dark:hover:text-brand-400 leading-tight truncate block"
            onClick={e => e.stopPropagation()}
          >
            {candidate?.full_name}
          </Link>
          <p className="text-[10px] text-surface-500 dark:text-surface-400 truncate">{candidate?.primary_title}</p>
        </div>
        <GripVertical size={12} className="text-surface-300 dark:text-surface-500 shrink-0 mt-0.5" />
      </div>

      {/* Job row */}
      <div className="mt-2 pt-2 border-t border-surface-100 dark:border-surface-600">
        <p className="text-[11px] font-medium text-surface-800 dark:text-surface-200 truncate">{job?.title}</p>
        <p className="text-[10px] text-surface-500 dark:text-surface-400 truncate">{job?.company}</p>
        {job?.location && (
          <p className="text-[10px] text-surface-400 dark:text-surface-500 flex items-center gap-0.5 mt-0.5">
            <MapPin size={9} />{job.location}
          </p>
        )}
      </div>

      {/* Fit score (matches only) */}
      {isMatch && card.fit_score && (
        <div className="mt-2">
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', scoreColor(card.fit_score))}>
            {card.fit_score} fit
          </span>
        </div>
      )}

      {/* Rating */}
      {(candidate?.rating ?? 0) > 0 && (
        <div className="flex gap-0.5 mt-1.5">
          {Array.from({ length: candidate.rating }).map((_: any, i: number) => (
            <Star key={i} size={8} className="text-amber-400 fill-amber-400" />
          ))}
        </div>
      )}

      {/* Interview date */}
      {stage === 'interview' && card.interview_date && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-brand-400">
          <Calendar size={9} /> {formatDate(card.interview_date)}
        </div>
      )}

      {/* Hover actions */}
      <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {job?.url && (
          <a href={job.url} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-surface-400 dark:text-surface-500 hover:text-brand-600 dark:hover:text-brand-400 flex items-center gap-0.5"
            onClick={e => e.stopPropagation()}>
            <ExternalLink size={9} /> Job
          </a>
        )}
        {nextStage && (
          <div className="ml-auto">
            <button
              onClick={() => !disabled && onMove(card, nextStage)}
              disabled={disabled}
              className={cn('text-[10px] px-1.5 py-0.5 rounded transition-colors', disabled ? 'opacity-50 cursor-not-allowed' : NEXT_COLORS[stage])}
            >
              {NEXT_LABELS[stage]}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}