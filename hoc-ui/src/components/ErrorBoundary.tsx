import { AlertTriangle, RefreshCw } from "lucide-react";
/**
 * ErrorBoundary — catches any React render error and shows a recovery UI
 * instead of blanking the whole page.
 */
import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  /** Optional label shown in the error card. Defaults to "This section". */
  label?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Can pipe to an error reporter here
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  recover = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[240px] p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center mb-4">
            <AlertTriangle size={26} className="text-danger" />
          </div>
          <h3 className="text-sm font-bold text-text-heading mb-1">
            {this.props.label ?? "This section"} encountered an error
          </h3>
          <p className="text-xs text-text-muted mb-4 max-w-xs font-mono">
            {this.state.error?.message ?? "Unknown error"}
          </p>
          <button
type="button"             onClick={this.recover}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            <RefreshCw size={14} />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
