'use client';

import React from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Optional label for the section (e.g. "Matches list") */
  sectionName?: string;
}

interface State {
  hasError: boolean;
}

const defaultFallback = (onRetry: () => void, sectionName?: string) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-8 text-center">
    <AlertCircle className="h-10 w-10 text-destructive" />
    <p className="text-sm font-medium">
      {sectionName ? `${sectionName} failed to load` : 'Something went wrong'}
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      Try again
    </button>
  </div>
);

/** Client-side error boundary for dashboard sections. Catches render errors and shows a fallback. */
export class DashboardErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    Sentry.captureException(error, {
      contexts: {
        react: { componentStack: info.componentStack },
      },
    });
    console.error('[DashboardErrorBoundary]', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return defaultFallback(() => this.setState({ hasError: false }), this.props.sectionName);
    }
    return this.props.children;
  }
}
