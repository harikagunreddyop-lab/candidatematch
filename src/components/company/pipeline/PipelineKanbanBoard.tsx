'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { PipelineCandidateCard, type PipelineCardData } from './PipelineCandidateCard';
import type { PipelineStage } from '@/types/pipeline';
import { cn } from '@/utils/helpers';

export interface PipelineKanbanBoardProps {
  jobId?: string;
  onCardClick?: (card: PipelineCardData) => void;
  onRefresh?: () => void;
  className?: string;
}

interface BoardData {
  stages: PipelineStage[];
  applications: unknown[];
  applicationsByStage: Record<string, unknown[]>;
}

function DroppableColumn({
  stage,
  cards,
  onCardClick,
}: {
  stage: PipelineStage;
  cards: PipelineCardData[];
  onCardClick?: (card: PipelineCardData) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const borderStyle = stage.stage_color
    ? { borderTop: `3px solid ${stage.stage_color}` }
    : { borderTop: '3px solid var(--surface-300, #cbd5e1)' };
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-72 rounded-xl flex flex-col transition-colors min-h-[320px]',
        stage.stage_color
          ? 'bg-surface-100 dark:bg-surface-800/50'
          : 'bg-surface-100 dark:bg-surface-800/50',
        isOver && 'ring-2 ring-brand-500 bg-brand-500/5'
      )}
      style={borderStyle}
    >
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2.5 rounded-t-xl text-xs font-semibold',
          stage.stage_color ? 'text-surface-700 dark:text-surface-200' : 'bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-200'
        )}
      >
        <span>{stage.stage_name}</span>
        <span className="opacity-80 tabular-nums">{cards.length}</span>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        {cards.map((card) => {
          const cardId = card._type === 'application' && card.id ? card.id : `match:${card.candidate_id}:${card.job_id}`;
          return (
            <DraggableCard
              key={cardId}
              card={card}
              stage={stage}
              onCardClick={onCardClick}
            />
          );
        })}
        {cards.length === 0 && (
          <div className="h-20 rounded-lg border-2 border-dashed border-surface-200 dark:border-surface-600 flex items-center justify-center text-xs text-surface-400 dark:text-surface-500">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  card,
  stage,
  onCardClick,
}: {
  card: PipelineCardData;
  stage: PipelineStage;
  onCardClick?: (card: PipelineCardData) => void;
}) {
  const id =
    card._type === 'application' && card.id
      ? card.id
      : `match:${card.candidate_id}:${card.job_id}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(isDragging && 'opacity-90 shadow-lg z-50')}
    >
      <PipelineCandidateCard
        card={card}
        stageId={stage.id}
        stageColor={stage.stage_color}
        onClick={onCardClick}
      />
    </div>
  );
}

export function PipelineKanbanBoard({
  jobId,
  onCardClick,
  onRefresh,
  className,
}: PipelineKanbanBoardProps) {
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_movingId, setMovingId] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = jobId
        ? `/api/company/pipeline/board?job_id=${encodeURIComponent(jobId)}`
        : '/api/company/pipeline/board';
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      const json = await res.json();
      setData({
        stages: (json.stages ?? []) as PipelineStage[],
        applications: json.applications ?? [],
        applicationsByStage: (json.applicationsByStage ?? {}) as Record<string, unknown[]>,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pipeline');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const moveCard = useCallback(
    async (card: PipelineCardData, toStageId: string) => {
      const cardId = card._type === 'application' ? card.id : `match:${card.candidate_id}:${card.job_id}`;
      setMovingId(cardId ?? null);
      try {
        if (card._type === 'match') {
          const createRes = await fetch('/api/applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate_id: card.candidate_id,
              job_id: card.job_id,
              status: 'applied',
              applied_at: new Date().toISOString(),
            }),
          });
          const created = await createRes.json().catch(() => ({}));
          if (!createRes.ok) throw new Error(created.error || 'Failed to create application');
          const appId = created.id;
          const moveRes = await fetch('/api/company/pipeline/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ application_id: appId, to_stage_id: toStageId }),
          });
          if (!moveRes.ok) {
            const j = await moveRes.json().catch(() => ({}));
            throw new Error(j.error || 'Failed to move');
          }
        } else {
          const moveRes = await fetch('/api/company/pipeline/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              application_id: card.id,
              to_stage_id: toStageId,
            }),
          });
          if (!moveRes.ok) {
            const j = await moveRes.json().catch(() => ({}));
            throw new Error(j.error || 'Failed to move');
          }
        }
        setOptimistic((prev) => {
          const next = { ...prev };
          if (cardId != null) delete next[cardId];
          return next;
        });
        await fetchBoard();
        onRefresh?.();
      } catch (e) {
        setOptimistic((prev) => {
          const next = { ...prev };
          if (cardId != null) delete next[cardId];
          return next;
        });
        throw e;
      } finally {
        setMovingId(null);
      }
    },
    [fetchBoard, onRefresh]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (_e: DragStartEvent) => {};

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    if (data?.stages.some((s) => s.id === overId)) {
      setOptimistic((prev) => ({ ...prev, [String(active.id)]: overId }));
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    const activeId = String(active.id);
    setOptimistic((prev) => {
      const next = { ...prev };
      delete next[activeId];
      return next;
    });

    if (!over || !data) return;
    const toStageId = String(over.id);
    if (!data.stages.some((s) => s.id === toStageId)) return;

    const card = findCard(data, activeId);
    if (!card) return;

    const currentStageId = getCardStageId(data, card);
    if (currentStageId === toStageId) return;

    setMovingId(activeId);
    try {
      await moveCard(card, toStageId);
    } catch {
      await fetchBoard();
    } finally {
      setMovingId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className={cn('flex items-center justify-center py-20', className)}>
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center', className)}>
        <p className="text-red-700 dark:text-red-300 font-medium">Failed to load pipeline</p>
        <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
        <button
          type="button"
          onClick={() => fetchBoard()}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.stages.length === 0) {
    return (
      <div className={cn('rounded-xl border border-surface-200 dark:border-surface-700 p-8 text-center text-surface-500', className)}>
        No pipeline stages. Add stages in settings or run migrations to seed defaults.
      </div>
    );
  }

  const applicationsByStageWithOptimistic = data.stages.reduce(
    (acc: Record<string, PipelineCardData[]>, stage: PipelineStage) => {
      const stageId = stage.id;
      const base = (data.applicationsByStage[stageId] ?? []) as PipelineCardData[];
      const withMoved = base.map((card) => {
        const cardId: string = card._type === 'application' ? (card.id ?? '') : `match:${card.candidate_id}:${card.job_id}`;
        const toId = optimistic[cardId];
        if (toId && toId !== stageId) return null;
        if (toId === stageId) return card;
        return card;
      }).filter(Boolean) as PipelineCardData[];
      const fromOther = Object.entries(optimistic).filter(([, toId]) => toId === stageId).map(([id]) => findCard(data, id)).filter(Boolean) as PipelineCardData[];
      acc[stageId] = [...withMoved.filter((c) => !fromOther.some((f) => (f._type === 'application' ? f.id : `match:${f.candidate_id}:${f.job_id}`) === (c._type === 'application' ? c.id : `match:${c.candidate_id}:${c.job_id}`))), ...fromOther];
      return acc;
    },
    {} as Record<string, PipelineCardData[]>
  );
  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className={cn('flex gap-4 overflow-x-auto pb-4', className)}>
        {data.stages.map((stage) => (
          <DroppableColumn
            key={stage.id}
            stage={stage}
            cards={(applicationsByStageWithOptimistic[stage.id] ?? [])}
            onCardClick={onCardClick}
          />
        ))}
      </div>
    </DndContext>
  );
}

function findCard(data: BoardData, activeId: string): PipelineCardData | null {
  if (activeId.startsWith('match:')) {
    const [, cId, jId] = activeId.split(':');
    for (const cards of Object.values(data.applicationsByStage)) {
      const card = (cards as PipelineCardData[]).find(
        (c) => c._type === 'match' && c.candidate_id === cId && c.job_id === jId
      );
      if (card) return card;
    }
    return null;
  }
  for (const cards of Object.values(data.applicationsByStage)) {
    const card = (cards as PipelineCardData[]).find(
      (c) => c._type === 'application' && c.id === activeId
    );
    if (card) return card;
  }
  return null;
}

function getCardStageId(data: BoardData, card: PipelineCardData): string | null {
  for (const [stageId, cards] of Object.entries(data.applicationsByStage)) {
    const found = (cards as PipelineCardData[]).some(
      (c) =>
        (c._type === 'application' && c.id === card.id) ||
        (c._type === 'match' && c.candidate_id === card.candidate_id && c.job_id === card.job_id)
    );
    if (found) return stageId;
  }
  return data.stages[0]?.id ?? null;
}
