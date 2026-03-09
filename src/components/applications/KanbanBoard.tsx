'use client';

import { useCallback, useState } from 'react';
import {
  DndContext,
  DragOverEvent,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { ApplicationCard } from './ApplicationCard';
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from '@/types/applications';
import { daysInStatus } from '@/types/applications';
import { cn } from '@/utils/helpers';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  ready: 'Ready',
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  ready: 'border-surface-600',
  applied: 'border-blue-500/50',
  screening: 'border-amber-500/50',
  interview: 'border-brand-500/50',
  offer: 'border-emerald-500/50',
  rejected: 'border-red-500/50',
  withdrawn: 'border-surface-600',
};

export interface KanbanBoardProps {
  applications: Application[];
  onStatusChange: (applicationId: string, newStatus: ApplicationStatus) => Promise<void>;
  onCardClick?: (application: Application) => void;
  className?: string;
}

export function KanbanBoard({
  applications,
  onStatusChange,
  onCardClick,
  className,
}: KanbanBoardProps) {
  const [_activeId, setActiveId] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, ApplicationStatus>>({});

  const appsByStatus = useCallback(() => {
    const map: Record<ApplicationStatus, Application[]> = {} as Record<ApplicationStatus, Application[]>;
    APPLICATION_STATUSES.forEach((s) => { map[s] = []; });
    applications.forEach((app) => {
      const status = (optimistic[app.id] ?? app.status) as ApplicationStatus;
      if (map[status]) map[status].push({ ...app, status });
    });
    return map;
  }, [applications, optimistic]);

  const byStatus = appsByStatus();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const overId = over.id as string;
    if (APPLICATION_STATUSES.includes(overId as ApplicationStatus)) {
      const appId = active.id as string;
      setOptimistic((prev) => ({ ...prev, [appId]: overId as ApplicationStatus }));
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);

    if (!over) {
      setOptimistic({});
      return;
    }

    const overId = over.id as string;
    if (!APPLICATION_STATUSES.includes(overId as ApplicationStatus)) {
      setOptimistic({});
      return;
    }

    const applicationId = active.id as string;
    const app = applications.find((a) => a.id === applicationId);
    if (!app || app.status === overId) {
      setOptimistic({});
      return;
    }

    setOptimistic((prev) => ({ ...prev, [applicationId]: overId as ApplicationStatus }));

    try {
      await onStatusChange(applicationId, overId as ApplicationStatus);
    } catch {
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[applicationId];
        return next;
      });
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOptimistic({});
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={cn('flex gap-4 overflow-x-auto pb-4', className)}>
        {APPLICATION_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            id={status}
            title={STATUS_LABELS[status]}
            applications={byStatus[status]}
            count={byStatus[status].length}
            columnColor={STATUS_COLORS[status]}
            isOver={false}
            onCardClick={onCardClick}
          />
        ))}
      </div>
    </DndContext>
  );
}

interface KanbanColumnProps {
  id: ApplicationStatus;
  title: string;
  applications: Application[];
  count: number;
  columnColor: string;
  isOver: boolean;
  onCardClick?: (application: Application) => void;
}

function KanbanColumn({
  id,
  title,
  applications,
  count,
  columnColor,
  onCardClick,
}: KanbanColumnProps) {
  const { setNodeRef, isOver: isDroppableOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-72 rounded-xl border-2 bg-surface-900/50 transition-colors',
        columnColor,
        isDroppableOver && 'ring-2 ring-brand-500/50 bg-brand-500/5'
      )}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-700/60 rounded-t-xl bg-surface-800/80">
        <h3 className="font-semibold text-surface-200">{title}</h3>
        <span className="text-sm text-surface-500 tabular-nums">{count}</span>
      </div>
      <div className="p-2 space-y-2 min-h-[120px]">
        {applications.map((app) => (
          <ApplicationCard
            key={app.id}
            application={{
              ...app,
              days_in_status: app.days_in_status ?? daysInStatus(app.updated_at),
            }}
            onClick={onCardClick}
          />
        ))}
        {applications.length === 0 && (
          <div className="rounded-xl border border-dashed border-surface-600 p-4 text-center text-sm text-surface-500">
            No applications
          </div>
        )}
      </div>
    </div>
  );
}
