"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
            Something went wrong.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="min-h-touch min-w-touch rounded-bento bg-primary-500 px-6 py-3 font-medium text-white hover:bg-primary-600"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
