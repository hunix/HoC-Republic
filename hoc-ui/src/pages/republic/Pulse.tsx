import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Bell,
  RefreshCw,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert, RpcStatus } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type PulseAlert = {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  source?: string;
  ts: number;
  resolved?: boolean;
};
type PulseSummary = {
  status: "healthy" | "degraded" | "critical";
  alerts: PulseAlert[];
  uptime?: number;
  latencyMs?: number;
};

export function PulsePage() {
  const {
    data: latest,
    loading,
    error,
    refetch,
  } = useRpc<PulseSummary>("republic.pulse.latest", {}, [], {
    staleTimeMs: 3_000,
    refetchIntervalMs: 5_000,
  });
  const { data: histData } = useRpc<{ history?: PulseSummary[] }>(
    "republic.pulse.history",
    {},
    [],
    { staleTimeMs: 15_000 },
  );
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const alerts = latest?.alerts ?? [];
  const unresolvedAlerts = alerts.filter((a) => !a.resolved);
  const critical = alerts.filter((a) => a.severity === "critical" || a.severity === "error").length;

  async function startPulse() {
    setRunning(true);
    setActionError("");
    try {
      await rpc("republic.pulse.start", {});
      invalidateRpcCache("republic.pulse.latest");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function stopPulse() {
    setActionError("");
    try {
      await rpc("republic.pulse.stop", {});
      invalidateRpcCache("republic.pulse.latest");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function resolveAlert(id: string) {
    try {
      await rpc("republic.pulse.resolve_alert", { alertId: id });
      invalidateRpcCache("republic.pulse.latest");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const statusVariant =
    latest?.status === "healthy" ? "success" : latest?.status === "critical" ? "danger" : "warning";

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="System Pulse"
        description="Live system health monitoring, alerts, and incident tracking"
        icon={<Activity size={28} />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Refresh
            </Button>
            <Button size="sm" icon={<Play size={14} />} loading={running} onClick={startPulse}>
              Start Monitor
            </Button>
            <Button size="sm" variant="outline" icon={<Square size={14} />} onClick={stopPulse}>
              Stop
            </Button>
          </div>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}
      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Status"
          value={latest?.status ?? "Unknown"}
          icon={
            latest?.status === "healthy" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />
          }
        />
        <StatCard label="Active Alerts" value={unresolvedAlerts.length} icon={<Bell size={16} />} />
        <StatCard label="Critical Issues" value={critical} icon={<AlertTriangle size={16} />} />
        <StatCard
          label="Latency"
          value={latest?.latencyMs != null ? `${latest.latencyMs}ms` : "—"}
          icon={<Activity size={16} />}
        />
      </div>

      {/* Overall Status Banner */}
      {latest?.status && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            latest.status === "healthy"
              ? "bg-success/10 border-success/30"
              : latest.status === "critical"
                ? "bg-danger/10 border-danger/30"
                : "bg-warning/10 border-warning/30"
          }`}
        >
          {latest.status === "healthy" ? (
            <CheckCircle size={20} className="text-success" />
          ) : (
            <AlertTriangle size={20} className="text-warning" />
          )}
          <div>
            <p className="font-semibold text-text-heading">
              System is <Badge variant={statusVariant}>{latest.status.toUpperCase()}</Badge>
            </p>
            {latest.uptime != null && (
              <p className="text-xs text-text-muted mt-0.5">
                Uptime: {Math.floor(latest.uptime / 3600)}h{" "}
                {Math.floor((latest.uptime % 3600) / 60)}m
              </p>
            )}
          </div>
        </div>
      )}

      {/* Active Alerts */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
          <Bell size={16} /> Active Alerts
        </h3>
        {loading ? (
          <p className="text-sm text-text-muted">Loading...</p>
        ) : unresolvedAlerts.length === 0 ? (
          <div className="flex items-center gap-2 text-success text-sm">
            <CheckCircle size={16} /> All clear — no active alerts
          </div>
        ) : (
          <div className="space-y-3">
            {unresolvedAlerts.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
              >
                <div className="flex items-start gap-3">
                  <Badge
                    variant={
                      a.severity === "critical" || a.severity === "error"
                        ? "danger"
                        : a.severity === "warning"
                          ? "warning"
                          : "info"
                    }
                  >
                    {a.severity}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-text-heading">{a.message}</p>
                    {a.source && <p className="text-xs text-text-muted">Source: {a.source}</p>}
                    <p className="text-xs text-text-muted">{new Date(a.ts).toLocaleTimeString()}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Trash2 size={12} />}
                  onClick={() => resolveAlert(a.id)}
                >
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Resolved Alerts */}
      {alerts.filter((a) => a.resolved).length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <CheckCircle size={16} /> Resolved
          </h3>
          <div className="space-y-2">
            {alerts
              .filter((a) => a.resolved)
              .map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg opacity-60">
                  <Badge variant="neutral">{a.severity}</Badge>
                  <span className="text-sm text-text-secondary line-through">{a.message}</span>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* History Snapshot */}
      {histData?.history && histData.history.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">
            📊 History ({histData.history.length} snapshots)
          </h3>
          <div className="flex gap-1 flex-wrap">
            {histData.history.slice(-30).map((h, i) => (
              <div
                key={i}
                title={h.status}
                className={`w-4 h-8 rounded-sm flex-shrink-0 ${h.status === "healthy" ? "bg-success" : h.status === "critical" ? "bg-danger" : "bg-warning"}`}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
