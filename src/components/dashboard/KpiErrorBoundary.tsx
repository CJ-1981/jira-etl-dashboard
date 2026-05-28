'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * @MX:ANCHOR: KPI Error Boundary
 * Standardized error boundary for KPI visualization components.
 */
export class KpiErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('KPI Component Error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        // @MX:NOTE: Inject reset handler into custom fallback
        return React.isValidElement(this.props.fallback)
          ? React.cloneElement(this.props.fallback as React.ReactElement, { onReset: this.handleReset } as any)
          : this.props.fallback;
      }

      // @MX:WARN: Sanitize error message for UI display
      const displayMessage = this.state.error?.message?.includes('fetch') 
        ? 'Data connection error' 
        : 'Metric calculation error';

      return (
        <div className="p-6 rounded-xl border border-red-500/20 bg-red-50/50 dark:bg-red-900/10 flex flex-col items-center justify-center text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-red-500" />
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-400">KPI Error</h3>
            <p className="text-sm text-red-700 dark:text-red-500/80">{displayMessage}</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={this.handleReset}
            className="border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
