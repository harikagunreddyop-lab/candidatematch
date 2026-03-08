/**
 * Performance monitoring: track slow operations and send to Sentry/PostHog.
 */
import * as Sentry from '@sentry/nextjs';
import { logger } from './logger';

export class PerformanceMonitor {
  private startTime: number;
  private checkpoints: Map<string, number>;

  constructor(private operationName: string) {
    this.startTime = performance.now();
    this.checkpoints = new Map();
  }

  checkpoint(name: string): void {
    this.checkpoints.set(name, performance.now() - this.startTime);
  }

  finish(): void {
    const duration = performance.now() - this.startTime;

    if (duration > 1000) {
      logger.warn({
        msg: 'Slow operation detected',
        operation: this.operationName,
        duration,
        checkpoints: Object.fromEntries(this.checkpoints),
      });
    }

    try {
      Sentry.setMeasurement(this.operationName, duration, 'millisecond');
    } catch {
      // Sentry may not be configured
    }

    if (typeof window !== 'undefined' && (window as unknown as { posthog?: { capture: (name: string, props: Record<string, unknown>) => void } }).posthog) {
      const w = window as unknown as { posthog?: { capture: (name: string, props: Record<string, unknown>) => void } };
      w.posthog?.capture('performance', {
        operation: this.operationName,
        duration,
        checkpoints: Object.fromEntries(this.checkpoints),
      });
    }
  }
}

export function trackPerformance<T>(
  operationName: string,
  fn: (monitor: PerformanceMonitor) => Promise<T>
): Promise<T> {
  const monitor = new PerformanceMonitor(operationName);
  return fn(monitor).finally(() => monitor.finish());
}
