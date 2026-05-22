import { Clock, CheckCircle, XCircle, Cpu, DollarSign, Layers } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import type { SessionSummary } from "../AgentTelemetryPage";

interface Props {
  sessions: SessionSummary[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTokens(n: number): string {
  if (n < 1000) {
    return String(n);
  }
  if (n < 1_000_000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) {
    return "just now";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function SessionHistoryPanel({ sessions }: Props) {
  return (
    <div className="space-y-3">
      {sessions.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No session history yet — run an agent task to see session traces
        </div>
      )}

      {sessions.map((s) => (
        <Card key={s.id} className="p-4 hover:border-accent/30 transition-colors">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {s.success ? (
                <CheckCircle size={16} className="text-success flex-shrink-0" />
              ) : (
                <XCircle size={16} className="text-danger flex-shrink-0" />
              )}
              <span className="text-sm font-medium text-text-primary truncate">
                {s.prompt || "Agent Session"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <Badge variant={s.success ? "success" : "danger"}>
                {s.success ? "Success" : "Failed"}
              </Badge>
              <span className="text-xs text-text-muted">{timeAgo(s.startedAt)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-text-secondary">
            <div className="flex items-center gap-1.5">
              <Cpu size={12} className="text-accent" />
              <span className="capitalize">{s.provider}</span>
              <span className="text-text-muted truncate max-w-[100px]" title={s.model}>
                / {s.model.split("/").pop()?.split("-").slice(0, 2).join("-") ?? s.model}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Layers size={12} className="text-purple" />
              <span>{s.iterations} iterations</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Clock size={12} className="text-warning" />
              <span>{formatDuration(s.durationMs)}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Cpu size={12} className="text-info" />
              <span>{formatTokens(s.totalTokens)} tokens</span>
            </div>

            <div className="flex items-center gap-1.5">
              <DollarSign size={12} className="text-success" />
              <span>${s.estimatedCostUsd.toFixed(4)}</span>
              <span className="text-text-muted">·</span>
              <span>{s.toolCalls} tools</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
