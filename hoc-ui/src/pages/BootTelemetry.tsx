/**
 * Boot Telemetry — real-time visualization of the gateway boot sequence.
 *
 * Shows a timeline of all boot items, their dependencies, durations,
 * and status. Useful for diagnosing slow starts and boot failures.
 */
import {
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  Loader2,
  RefreshCw,
  Layers,
} from "lucide-react";
import { PageHeader, Card, Badge, Button, RpcStatus, StatCard, ProgressBar } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

interface BootItem {
  id: string;
  label: string;
  tier: string;
  status: string;
  level: number;
  deps: string[];
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  error: string | null;
}

interface BootTimeline {
  phase: string;
  totalDurationMs: number | null;
  items: BootItem[];
}

const TIER_COLORS: Record<string, string> = {
  critical: "danger",
  core: "info",
  enhance: "purple",
  optional: "neutral",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 size={12} className="text-success" />,
  failed: <XCircle size={12} className="text-danger" />,
  skipped: <SkipForward size={12} className="text-text-muted" />,
  running: <Loader2 size={12} className="text-accent animate-spin" />,
  pending: <Clock size={12} className="text-text-muted opacity-40" />,
};

function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) {
    return "—";
  }
  if (ms < 1) {
    return "<1ms";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtTime(ts: number | null): string {
  if (!ts) {
    return "—";
  }
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export function BootTelemetryPage() {
  const { data, loading, error, refetch } = useRpc<BootTimeline>("republic.boot.timeline", {}, [], {
    staleTimeMs: 2000,
    refetchIntervalMs: 3000,
  });

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const items = data?.items ?? [];
  const phase = data?.phase ?? "idle";
  const totalMs = data?.totalDurationMs;

  const doneCount = items.filter((i) => i.status === "done").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const skippedCount = items.filter((i) => i.status === "skipped").length;
  const runningCount = items.filter((i) => i.status === "running").length;

  // Compute max duration for bar scaling
  const maxDuration = Math.max(...items.map((i) => i.durationMs ?? 0), 1);

  // Group items by level
  const levelMap = new Map<number, BootItem[]>();
  for (const item of items) {
    const arr = levelMap.get(item.level) ?? [];
    arr.push(item);
    levelMap.set(item.level, arr);
  }
  const levels = [...levelMap.entries()].toSorted((a, b) => a[0] - b[0]);

  const phaseColor =
    phase === "done"
      ? "success"
      : phase === "failed"
        ? "danger"
        : phase === "booting"
          ? "info"
          : "neutral";

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <PageHeader
        title="Boot Telemetry"
        description={phase === "idle" ? "Boot not started" : `${phase} · ${fmtMs(totalMs)}`}
        icon={<Zap size={20} />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={13} />}
            aria-label="Refresh"
            onClick={refetch}
          />
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard
          label="Phase"
          value={phase}
          icon={<Zap size={14} className={`text-${phaseColor}`} />}
        />
        <StatCard
          label="Done"
          value={doneCount}
          icon={<CheckCircle2 size={14} className="text-success" />}
        />
        <StatCard
          label="Failed"
          value={failedCount}
          icon={<XCircle size={14} className="text-danger" />}
        />
        <StatCard
          label="Skipped"
          value={skippedCount}
          icon={<SkipForward size={14} className="text-text-muted" />}
        />
        <StatCard label="Total Time" value={fmtMs(totalMs)} icon={<Clock size={14} />} />
      </div>

      {/* Overall progress */}
      {items.length > 0 && (
        <Card compact>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
              Boot Progress
            </span>
            <Badge variant={phaseColor as "success" | "danger" | "info" | "neutral"} dot>
              {phase}
            </Badge>
          </div>
          <ProgressBar
            value={doneCount + failedCount + skippedCount}
            max={items.length}
            labelLeft={`${doneCount + failedCount + skippedCount}/${items.length}`}
            labelRight={runningCount > 0 ? `${runningCount} running` : undefined}
          />
        </Card>
      )}

      {/* Timeline by levels */}
      {levels.map(([level, levelItems]) => (
        <div key={level}>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              <Layers size={11} />
              Level {level}
            </div>
            <div className="flex-1 border-t border-border/20" />
            <span className="text-[10px] text-text-muted">
              {levelItems.length} item{levelItems.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-1">
            {levelItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-card border border-border/20 hover:border-border/40 transition-colors group"
              >
                {/* Status icon */}
                <div className="w-5 flex justify-center shrink-0">
                  {STATUS_ICON[item.status] ?? STATUS_ICON.pending}
                </div>

                {/* Name + tier */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-text-primary truncate">
                      {item.label}
                    </span>
                    <Badge
                      variant={
                        (TIER_COLORS[item.tier] ?? "neutral") as
                          | "danger"
                          | "info"
                          | "purple"
                          | "neutral"
                      }
                      className="!text-[8px] !py-0 !px-1"
                    >
                      {item.tier}
                    </Badge>
                  </div>
                  {item.deps.length > 0 && (
                    <div className="text-[9px] text-text-muted mt-0.5">
                      deps: {item.deps.join(", ")}
                    </div>
                  )}
                  {item.error && (
                    <div className="text-[9px] text-danger mt-0.5 truncate max-w-[400px]">
                      {item.error}
                    </div>
                  )}
                </div>

                {/* Duration bar */}
                <div className="w-32 shrink-0 hidden sm:block">
                  {item.durationMs !== null && (
                    <div className="relative h-3 rounded-full bg-bg-input overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                          item.status === "failed"
                            ? "bg-danger/40"
                            : item.durationMs > maxDuration * 0.5
                              ? "bg-warning/40"
                              : "bg-accent/30"
                        }`}
                        style={{ width: `${Math.max(4, (item.durationMs / maxDuration) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Timing */}
                <div className="text-right shrink-0 w-20">
                  <div className="text-xs font-mono text-text-primary tabular-nums">
                    {fmtMs(item.durationMs)}
                  </div>
                  <div className="text-[9px] text-text-muted tabular-nums">
                    {fmtTime(item.startedAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="text-center py-16">
          <Zap size={32} className="text-text-muted mx-auto mb-2 opacity-40" />
          <p className="text-xs text-text-muted">No boot data available yet.</p>
        </div>
      )}
    </div>
  );
}
