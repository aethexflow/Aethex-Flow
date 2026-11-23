import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'Unexpected workspace error';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.error && parsed?.operationType) {
        readable = `Cloud sync permission error (${parsed.operationType} on ${parsed.path || 'document'}): ${parsed.error}`;
      }
    } catch {
      // plain error message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Workspace ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0b0f] text-neutral-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl border border-red-500/30 bg-[#12141c] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-lg font-bold text-white">Workspace Recovery</h1>
            </div>
            <p className="text-sm text-neutral-300 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reload Workspace View</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
