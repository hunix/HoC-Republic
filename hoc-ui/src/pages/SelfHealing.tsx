import {
  ShieldCheck,
  Activity,
  Clock,
  AlertTriangle,
  // oxlint-disable-next-line no-unused-vars
  BookOpen,
  Settings,
  CheckCircle2,
  XCircle,
  Zap,
  Play,
  Bell,
} from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  Badge,
  Card,
  StatCard,
  Tabs,
  RpcStatus,
  Button,
  EmptyState,
  Alert,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

interface Incident {
  id: string;
  timestamp: number;
  tier: number;
  symptom: string;
  diagnosis: string;
  action: string;
  outcome: "resolved" | "escalated" | "pending";
  durationMs: number;
  rootCause: string;
}

interface Learning {
  timestamp: number;
  symptom: string;
  rootCause: string;
  solution: string;
  prevention: string;
}

interface PreflightCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export function SelfHealingPage() {
  const { data, loading, error, refetch } = useRpc<{
    upSince: number;
    totalIncidents: number;
    resolvedAutonomously: number;
    escalatedToHuman: number;
    avgRecoveryTimeMs: number;
    lastIncident: number;
    currentTier: number;
    consecutiveFailures: number;
    tiers: Record<string, boolean>;
    preflightPassed: boolean;
    preflightChecks: PreflightCheck[];
  }>("republic.healing.status", {});

  const { data: historyData } = useRpc<{ incidents: Incident[] }>("republic.healing.history", {
    limit: 50,
  });
  const { data: learningsData } = useRpc<{ learnings: Learning[] }>("republic.healing.learnings", {
    limit: 30,
  });

  const [activeTab, setActiveTab] = useState("status");
  const [simulating, setSimulating] = useState(false);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const currentTier = data?.currentTier ?? 0;
  const totalIncidents = data?.totalIncidents ?? 0;
  const resolved = data?.resolvedAutonomously ?? 0;
  const successRate = totalIncidents > 0 ? Math.round((resolved / totalIncidents) * 100) : 100;
  const uptime = data?.upSince ? fmtUp(Date.now() - data.upSince) : "—";
  const incidents = historyData?.incidents ?? [];
  const learnings = learningsData?.learnings ?? [];

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      await rpc("republic.healing.test", { type: "ECONNREFUSED" });
      refetch();
    } finally {
      setSimulating(false);
    }
  };

  const handleManualRecover = async () => {
    await rpc("republic.healing.manual-recover", {});
    refetch();
  };

  const tierNames = ["All Clear", "KeepAlive", "Watchdog", "AI Recovery", "Human Alert"];
  const tierColors: Array<"success" | "info" | "warning" | "danger" | "purple"> = [
    "success",
    "info",
    "warning",
    "danger",
    "purple",
  ];

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <PageHeader
        title="Self-Healing"
        description={`Tier ${currentTier} · ${totalIncidents} incidents · ${successRate}% auto-resolved`}
        icon={<ShieldCheck size={20} />}
        actions={
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              icon={<Play size={12} />}
              onClick={handleSimulate}
              disabled={simulating}
            >
              Simulate
            </Button>
            <Button
              variant="warning"
              size="sm"
              icon={<Zap size={12} />}
              onClick={handleManualRecover}
            >
              Recover
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Tier"
          value={tierNames[currentTier] ?? `T${currentTier}`}
          icon={<Activity size={14} />}
        />
        <StatCard label="Uptime" value={uptime} icon={<Clock size={14} />} />
        <StatCard label="Incidents" value={totalIncidents} icon={<AlertTriangle size={14} />} />
        <StatCard
          label="Auto-Resolved"
          value={`${successRate}%`}
          icon={<CheckCircle2 size={14} />}
        />
        <StatCard
          label="MTTR"
          value={data?.avgRecoveryTimeMs ? `${Math.round(data.avgRecoveryTimeMs / 1000)}s` : "—"}
          icon={<Zap size={14} />}
        />
      </div>

      <Tabs
        tabs={[
          { id: "status", label: "Status" },
          { id: "history", label: "History", count: incidents.length },
          { id: "learnings", label: "Learnings", count: learnings.length },
          { id: "config", label: "Config" },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "status" && (
        <div className="space-y-3">
          {/* Tier ladder */}
          <Card compact>
            <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
              Recovery Tiers
            </h3>
            <div className="space-y-1">
              {[0, 1, 2, 3, 4].map((tier) => {
                const isActive = currentTier === tier;
                const tierEnabled =
                  tier === 0
                    ? data?.tiers?.preflight
                    : tier === 1
                      ? data?.tiers?.keepAlive
                      : tier === 2
                        ? data?.tiers?.watchdog
                        : tier === 3
                          ? data?.tiers?.aiRecovery
                          : data?.tiers?.humanAlert;
                return (
                  <div
                    key={tier}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-colors ${
                      isActive
                        ? "border-accent/40 bg-accent/10"
                        : "border-border/20 bg-bg-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-accent animate-pulse" : tierEnabled ? "bg-success" : "bg-text-muted"}`}
                      />
                      <div>
                        <div className="text-xs font-medium text-text-primary">
                          T{tier}: {tierNames[tier]}
                        </div>
                        <div className="text-[9px] text-text-muted">
                          {tier === 0 && "Config validation"}
                          {tier === 1 && "Process heartbeat"}
                          {tier === 2 && "HTTP health + backoff"}
                          {tier === 3 && "AI diagnosis + fix"}
                          {tier === 4 && "Human alert"}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant={isActive ? tierColors[tier] : tierEnabled ? "success" : "neutral"}
                      dot
                    >
                      {isActive ? "Active" : tierEnabled ? "Ready" : "Off"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Preflight */}
          <Card compact>
            <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
              Preflight
            </h3>
            <div className="flex flex-wrap gap-2">
              {(data?.preflightChecks ?? []).map((check) => (
                <div key={check.name} className="flex items-center gap-1 text-[10px]">
                  {check.passed ? (
                    <CheckCircle2 size={10} className="text-success" />
                  ) : (
                    <XCircle size={10} className="text-danger" />
                  )}
                  <span className="text-text-primary">{check.name}</span>
                  <span className="text-text-muted">({check.detail})</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-1.5">
          {incidents.length === 0 ? (
            <EmptyState title="No incidents" description="Running smoothly" />
          ) : (
            incidents.map((inc) => (
              <div
                key={inc.id}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border/20 hover:border-border/40 transition-colors space-y-0.5"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    variant={
                      inc.outcome === "resolved"
                        ? "success"
                        : inc.outcome === "escalated"
                          ? "danger"
                          : "warning"
                    }
                    dot
                  >
                    {inc.outcome}
                  </Badge>
                  <Badge variant={tierColors[inc.tier] ?? "neutral"}>T{inc.tier}</Badge>
                  <span className="text-[9px] text-text-muted ml-auto tabular-nums">
                    {new Date(inc.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs font-medium text-text-primary">{inc.symptom}</div>
                <div className="text-[10px] text-text-secondary">Dx: {inc.diagnosis}</div>
                <div className="text-[10px] text-text-muted">Rx: {inc.action}</div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "learnings" && (
        <div className="space-y-1.5">
          {learnings.length === 0 ? (
            <EmptyState
              title="No learnings"
              description="Learnings appear as incidents are resolved"
            />
          ) : (
            learnings.map((l, idx) => (
              <Card key={idx} compact>
                <div className="text-[9px] text-text-muted mb-1 tabular-nums">
                  {new Date(l.timestamp).toLocaleString()}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-text-muted">Symptom:</span>{" "}
                    <span className="text-text-primary">{l.symptom}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Root:</span>{" "}
                    <span className="text-text-primary">{l.rootCause}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Fix:</span>{" "}
                    <span className="text-success">{l.solution}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Prevent:</span>{" "}
                    <span className="text-text-secondary">{l.prevention}</span>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "config" && (
        <div className="space-y-3">
          <Alert variant="info">
            Configure via <code className="text-text-primary">republic.healing.config</code> RPC.
          </Alert>
          <Card compact>
            <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
              <Settings size={10} /> Tiers
            </h3>
            <div className="space-y-1 text-xs">
              {Object.entries(data?.tiers ?? {}).map(([key, enabled]) => (
                <div key={key} className="flex justify-between items-center">
                  <span className="text-text-primary capitalize">
                    {key.replace(/([A-Z])/g, " $1")}
                  </span>
                  <Badge variant={enabled ? "success" : "neutral"} dot>
                    {enabled ? "On" : "Off"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
          <Card compact>
            <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
              <Bell size={10} /> Alerts
            </h3>
            <p className="text-[10px] text-text-secondary">
              Set Discord/Telegram webhooks via{" "}
              <code className="text-text-primary">republic.healing.alerts</code>
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

function fmtUp(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) {
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) {
    return `${h}h ${m % 60}m`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return `${s}s`;
}
