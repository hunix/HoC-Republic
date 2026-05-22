/**
 * RpcStatus — shared loading skeleton + error alert for RPC-backed pages.
 * Uses Liquid Glass shimmer effects for loading state.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useRpc("my.method", params);
 *   if (loading || error) return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
 */

import { AlertCircle, RefreshCw } from "lucide-react";

interface RpcStatusProps {
  /** Show skeleton loader */
  loading?: boolean;
  /** Error message string from useRpc */
  error?: string | null;
  /** Called when the user clicks "Retry" */
  onRetry?: () => void;
  /** Number of skeleton rows to show (default: 4) */
  rows?: number;
  /** Optional context label shown in the error card ("Failed to load sessions") */
  label?: string;
}

// Pre-compute skeleton row styles at module level (avoids 3 new objects per row per render)
const SKELETON_ROWS = Array.from({ length: 6 }, (_, i) => ({
  box: { opacity: 1 - i * 0.15, border: "none" } as React.CSSProperties,
  bar: { width: `${70 - i * 10}%`, opacity: 1 - i * 0.15, border: "none" } as React.CSSProperties,
  sub: { width: `${45 - i * 5}%`, opacity: 0.6 - i * 0.1, border: "none" } as React.CSSProperties,
}));

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-3" aria-busy="true" aria-label="Loading…">
      {SKELETON_ROWS.slice(0, rows).map((styles, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg glass-thin glass-shimmer shrink-0"
            style={styles.box}
          />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3 rounded-full glass-thin glass-shimmer"
              style={styles.bar}
            />
            <div
              className="h-2 rounded-full glass-thin glass-shimmer"
              style={styles.sub}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RpcStatus({ loading, error, onRetry, rows = 4, label }: RpcStatusProps) {
  if (loading) {
    return <Skeleton rows={rows} />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center py-12 gap-4 text-center px-6 liquid-bounce"
      >
        <div className="w-12 h-12 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center backdrop-blur-sm">
          <AlertCircle size={24} className="text-danger" />
        </div>
        <div>
          <p className="font-semibold text-text-heading text-sm">
            {label ?? "Failed to load data"}
          </p>
          <p className="text-xs text-text-muted mt-1 max-w-xs font-mono">{error}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 text-xs text-accent hover:text-accent/80
              transition-all duration-200 glass-thin rounded-[var(--radius-pill)] px-4 py-2
              hover:scale-105 active:scale-95 cursor-pointer"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        )}
      </div>
    );
  }

  return null;
}
