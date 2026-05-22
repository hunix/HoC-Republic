import {
  Activity,
  BarChart3,
  Clock,
  Cpu,
  DollarSign,
  Zap,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Layers,
  Target,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, StatCard, Tabs, RpcStatus, ProgressBar } from "@/components/ui";
import { useRpc } from "@/lib/rpc";
import SessionHistoryPanel from "./agent-telemetry/SessionHistoryPanel";
import StrategyPanel from "./agent-telemetry/StrategyPanel";
import ToolAnalyticsPanel from "./agent-telemetry/ToolAnalyticsPanel";

interface TelemetrySnapshot {
  activeSessions: number;
  totalSessions: number;
  totalIterations: number;
  totalTokens: number;
  totalCostUsd: number;
  totalToolCalls: number;
  totalToolErrors: number;
  avgSessionDurationMs: number;
  avgIterationsPerSession: number;
  successRate: number;
  toolStats: Record<string, ToolStat>;
  providerStats: Record<string, ProviderStat>;
  recentSessions: SessionSummary[];
  uptimeMs: number;
}

interface ToolStat {
  totalCalls: number;
  totalErrors: number;
  totalDurationMs: number;
  avgDurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  successRate: number;
}

interface ProviderStat {
  totalCalls: number;
  totalErrors: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  fallbackCount: number;
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  durationMs: number;
  provider: string;
  model: string;
  prompt: string;
  success: boolean;
  iterations: number;
  totalTokens: number;
  toolCalls: number;
  estimatedCostUsd: number;
}

export type { ToolStat, ProviderStat };

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

function formatUptime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function AgentTelemetryPage() {
  const { data, loading, error, refetch } = useRpc<TelemetrySnapshot>(
    "republic.agent.telemetry.snapshot",
    {},
    [],
    { refetchIntervalMs: 5000 },
  );
  const [tab, setTab] = useState("overview");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const snap = data!;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "tools", label: "Tool Analytics" },
    { key: "sessions", label: "Session History" },
    { key: "strategy", label: "Strategy Planner" },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Agent Telemetry"
        description="Real-time observability for autonomous agent sessions"
        icon={<Activity size={28} />}
        actions={
          <div className="flex items-center gap-3">
            {snap.activeSessions > 0 && (
              <Badge variant="success">
                <Zap size={12} className="mr-1" />
                {snap.activeSessions} Active
              </Badge>
            )}
            <Badge variant="info">
              <Clock size={12} className="mr-1" />
              Uptime: {formatUptime(snap.uptimeMs)}
            </Badge>
          </div>
        }
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total Sessions"
          value={snap.totalSessions.toLocaleString()}
          icon={<Layers size={18} />}
          sub={`${snap.activeSessions} active`}
        />
        <StatCard
          label="Success Rate"
          value={`${Math.round(snap.successRate * 100)}%`}
          icon={<CheckCircle size={18} />}
          sub={
            snap.successRate >= 0.9
              ? "Excellent"
              : snap.successRate >= 0.7
                ? "Good"
                : "Needs attention"
          }
        />
        <StatCard
          label="Total Tokens"
          value={formatTokens(snap.totalTokens)}
          icon={<Cpu size={18} />}
          sub={`${snap.totalIterations} iterations`}
        />
        <StatCard
          label="Est. Cost"
          value={`$${snap.totalCostUsd.toFixed(2)}`}
          icon={<DollarSign size={18} />}
          sub="cumulative"
        />
        <StatCard
          label="Tool Calls"
          value={snap.totalToolCalls.toLocaleString()}
          icon={<Zap size={18} />}
          sub={`${snap.totalToolErrors} errors`}
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(snap.avgSessionDurationMs)}
          icon={<Clock size={18} />}
          sub={`~${snap.avgIterationsPerSession} iterations`}
        />
      </div>

      {/* Provider Overview */}
      <Card>
        <h3 className="text-lg font-semibold text-text-heading mb-4 flex items-center gap-2">
          <BarChart3 size={20} className="text-accent" />
          Provider Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(snap.providerStats).map(([name, ps]) => (
            <div key={name} className="p-4 rounded-lg bg-bg-secondary border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-text-primary capitalize">{name}</span>
                {ps.fallbackCount > 0 && (
                  <Badge variant="warning">
                    <AlertTriangle size={10} className="mr-1" />
                    {ps.fallbackCount} fallbacks
                  </Badge>
                )}
              </div>
              <div className="space-y-2 text-sm text-text-secondary">
                <div className="flex justify-between">
                  <span>Calls</span>
                  <span className="text-text-primary font-mono">{ps.totalCalls}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tokens</span>
                  <span className="text-text-primary font-mono">
                    {formatTokens(ps.totalTokens)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Latency</span>
                  <span className="text-text-primary font-mono">
                    {formatDuration(ps.avgLatencyMs)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Cost</span>
                  <span className="text-text-primary font-mono">${ps.totalCostUsd.toFixed(3)}</span>
                </div>
                <ProgressBar
                  value={ps.totalCalls - ps.totalErrors}
                  max={Math.max(ps.totalCalls, 1)}
                  labelLeft="Success"
                  labelRight={`${ps.totalCalls > 0 ? Math.round(((ps.totalCalls - ps.totalErrors) / ps.totalCalls) * 100) : 100}%`}
                  size="sm"
                />
              </div>
            </div>
          ))}
          {Object.keys(snap.providerStats).length === 0 && (
            <p className="text-text-muted col-span-full text-center py-4">
              No provider data yet — run an agent session to see metrics
            </p>
          )}
        </div>
      </Card>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="space-y-4">
          {/* Real-time health indicators */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h4 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-success" />
                System Health
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Tool Error Rate</span>
                  <Badge
                    variant={
                      snap.totalToolErrors / Math.max(snap.totalToolCalls, 1) < 0.05
                        ? "success"
                        : "warning"
                    }
                  >
                    {snap.totalToolCalls > 0
                      ? `${((snap.totalToolErrors / snap.totalToolCalls) * 100).toFixed(1)}%`
                      : "0%"}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Session Success</span>
                  <Badge
                    variant={
                      snap.successRate >= 0.9
                        ? "success"
                        : snap.successRate >= 0.7
                          ? "warning"
                          : "danger"
                    }
                  >
                    {Math.round(snap.successRate * 100)}%
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Active Agents</span>
                  <Badge variant={snap.activeSessions > 0 ? "info" : "neutral"}>
                    {snap.activeSessions}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Avg Iterations/Session</span>
                  <span className="text-text-primary font-mono text-sm">
                    {snap.avgIterationsPerSession.toFixed(1)}
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <h4 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
                <Target size={16} className="text-accent" />
                Cost Efficiency
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Cost/Session</span>
                  <span className="text-text-primary font-mono text-sm">
                    $
                    {snap.totalSessions > 0
                      ? (snap.totalCostUsd / snap.totalSessions).toFixed(4)
                      : "0.00"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Cost/Iteration</span>
                  <span className="text-text-primary font-mono text-sm">
                    $
                    {snap.totalIterations > 0
                      ? (snap.totalCostUsd / snap.totalIterations).toFixed(5)
                      : "0.00"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Tokens/Session</span>
                  <span className="text-text-primary font-mono text-sm">
                    {snap.totalSessions > 0
                      ? formatTokens(Math.round(snap.totalTokens / snap.totalSessions))
                      : "0"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Cost/1M Tokens</span>
                  <span className="text-text-primary font-mono text-sm">
                    $
                    {snap.totalTokens > 0
                      ? ((snap.totalCostUsd / snap.totalTokens) * 1_000_000).toFixed(2)
                      : "0.00"}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "tools" && <ToolAnalyticsPanel toolStats={snap.toolStats} />}
      {tab === "sessions" && <SessionHistoryPanel sessions={snap.recentSessions} />}
      {tab === "strategy" && <StrategyPanel />}
    </div>
  );
}
