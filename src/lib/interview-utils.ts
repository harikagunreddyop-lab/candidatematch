/**
 * Interview calendar and list helpers.
 */

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

export function getMonthStart(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function getMonthEnd(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return x;
}

export function getWeekStart(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function countdownTo(iso: string): string {
  const now = new Date().getTime();
  const then = new Date(iso).getTime();
  const diff = then - now;
  if (diff <= 0) return 'Past';
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  phone: 'Phone',
  video: 'Video',
  onsite: 'On-site',
  technical: 'Technical',
  behavioral: 'Behavioral',
  case_study: 'Case study',
};

export const OUTCOME_LABELS: Record<string, string> = {
  passed: 'Passed',
  rejected: 'Rejected',
  pending: 'Pending',
  cancelled: 'Cancelled',
};
