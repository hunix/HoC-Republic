import {
  Monitor,
  Settings,
  HardDrive,
  Bot,
  Terminal,
  Users,
  Cpu,
  RefreshCw,
  Container,
  Database,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Card, StatCard, Badge, Button, ProgressBar, RpcStatus, Alert } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Redis Status Card ────────────────────────────────────────────

interface RedisStatusData {
  ok?: boolean;
  reachable?: boolean;
  containerStatus?: "running" | "stopped" | "missing" | "docker-unavailable";
}

function RedisCard() {
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);

  const { data, loading, refetch } = useRpc<RedisStatusData>(
    "republic.node.docker.redis.status",
    {},
    [],
    { staleTimeMs: 10_000, refetchIntervalMs: 15_000 },
  );

  const containerStatus = data?.containerStatus ?? "missing";
  const reachable = data?.reachable ?? false;

  const isHealthy = reachable && containerStatus === "running";
  const isStopped = containerStatus === "stopped" && !reachable;
  const isDockerDown = containerStatus === "docker-unavailable";

  async function handleDeploy() {
    setDeploying(true);
    setDeployError(null);
    setDeploySuccess(false);
    try {
      await rpc("republic.node.docker.redis.ensure", {});
      setDeploySuccess(true);
      setTimeout(() => { void refetch(); }, 2000);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Failed to deploy Redis");
    } finally {
      setDeploying(false);
    }
  }

  const statusColor = isHealthy
    ? "from-success/10 to-success/5 border-success/30"
    : isDockerDown
      ? "from-bg-card to-bg-card border-border"
      : "from-warning/10 to-warning/5 border-warning/30";

  const statusIcon = isHealthy ? (
    <CheckCircle2 size={16} className="text-success" />
  ) : isDockerDown ? (
    <Database size={16} className="text-text-muted" />
  ) : (
    <AlertTriangle size={16} className="text-warning" />
  );

  const statusLabel = isHealthy
    ? "Running"
    : isStopped
      ? "Stopped"
      : isDockerDown
        ? "Docker Unavailable"
        : "Not Deployed";

  const statusVariant: "success" | "warning" | "neutral" = isHealthy
    ? "success"
    : isDockerDown
      ? "neutral"
      : "warning";

  return (
    <Card className={`bg-gradient-to-r ${statusColor} space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isHealthy ? "bg-success/15" : "bg-warning/15"
            }`}
          >
            <Database size={18} className={isHealthy ? "text-success" : "text-warning"} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-text-heading text-sm">Redis — Citizen Memory</p>
              {statusIcon}
            </div>
            <p className="text-xs text-text-muted">
              {isHealthy
                ? "Connected · localhost:6379"
                : "Required for citizen memory, cluster state, and session caching"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {loading && <Loader2 size={13} className="animate-spin text-text-muted" />}
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          {!isHealthy && !isDockerDown && (
            <Button
              size="sm"
              variant="primary"
              icon={
                deploying
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Database size={12} />
              }
              disabled={deploying}
              onClick={() => { void handleDeploy(); }}
            >
              {deploying ? "Deploying…" : isStopped ? "Restart Redis" : "Deploy Redis"}
            </Button>
          )}
          {!isHealthy && (
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw size={12} />}
              aria-label="Refresh Redis status"
              onClick={() => { void refetch(); }}
            />
          )}
        </div>
      </div>

      {deploySuccess && (
        <Alert variant="success">
          ✅ Redis is now running. Citizens can use memory, cluster state and event streaming.
        </Alert>
      )}
      {deployError && <Alert variant="danger">{deployError}</Alert>}

      {!isHealthy && !isDockerDown && !deploySuccess && (
        <div className="text-xs text-text-muted border-t border-border/20 pt-2">
          Redis is one of the 6 citizen memory backends. Without it, cluster coordination and
          event pub/sub are unavailable. Click{" "}
          <strong className="text-text-secondary">Deploy Redis</strong> to launch{" "}
          <code className="mx-1 px-1 py-0.5 rounded bg-bg-secondary font-mono text-[10px]">
            hoc-redis-cluster
          </code>{" "}
          via Docker.
        </div>
      )}
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

export function NodeDashboardPage() {
  const navigate = useNavigate();
  const {
    data: health,
    refetch,
    loading,
    error,
  } = useRpc<{
    nodeId?: string;
    name?: string;
    gatewayUrl?: string;
    status?: string;
    uptime?: string;
    version?: string;
    citizens?: number;
    llmModels?: number;
  }>("health", {});
  const { data: sys } = useRpc<{
    cpu?: { loadPercent?: number };
    ram?: { usedGb?: number; totalGb?: number; percentUsed?: number };
    gpu?: { vramUsedMb?: number; vramTotalMb?: number; utilizationPercent?: number };
    disk?: { usedPct?: number };
  }>("windows.system.info", {});

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const nodeName = health?.name ?? "This Node";
  const nodeId = health?.nodeId ?? "—";
  const gatewayUrl = health?.gatewayUrl ?? "—";
  const isPaired = health?.status === "paired" || !!health?.gatewayUrl;
  const uptime = health?.uptime ?? "—";
  const version = health?.version ?? "—";
  const citizens = health?.citizens ?? 0;
  const llmModels = health?.llmModels ?? 0;

  const cpuPct = Math.round(sys?.cpu?.loadPercent ?? 0);
  const ramPct = Math.round(sys?.ram?.percentUsed ?? 0);
  const ramUsed = sys?.ram?.usedGb?.toFixed(1) ?? "—";
  const ramTotal = sys?.ram?.totalGb?.toFixed(0) ?? "—";
  const gpuVramUsed = sys?.gpu?.vramUsedMb ?? 0;
  const gpuVramTotal = sys?.gpu?.vramTotalMb ?? 8192;
  const gpuPct = Math.round((gpuVramUsed / gpuVramTotal) * 100);
  const diskPct = Math.round(sys?.disk?.usedPct ?? 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Node Dashboard"
        description="Local node overview: status, capabilities, and system health"
        icon={<Monitor size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
            Refresh
          </Button>
        }
      />

      <Card
        className={`bg-gradient-to-r ${
          isPaired
            ? "from-success/10 to-accent/10 border-success/30"
            : "from-warning/10 to-accent/10 border-warning/30"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-success/20 flex items-center justify-center text-3xl">
              🖥️
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-heading">{nodeName}</h2>
              <p className="text-sm text-text-muted font-mono">{nodeId}</p>
              <p className="text-xs text-text-muted">
                v{version} · Up {uptime}
              </p>
            </div>
          </div>
          <div className="text-right">
            <Badge variant={isPaired ? "success" : "warning"}>
              {isPaired ? "✓ Paired" : "Unpaired"}
            </Badge>
            {gatewayUrl !== "—" && (
              <p className="text-xs text-text-muted mt-1">Gateway: {gatewayUrl}</p>
            )}
          </div>
        </div>
      </Card>

      {/* ── Redis Infrastructure Status ── */}
      <RedisCard />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Citizens" value={citizens} icon={<Users size={16} />} />
        <StatCard label="CPU" value={`${cpuPct}%`} icon={<Cpu size={16} />} />
        <StatCard
          label="RAM"
          value={`${ramUsed} GB`}
          icon={<HardDrive size={16} />}
          sub={`of ${ramTotal}GB`}
        />
        <StatCard label="LLM Models" value={llmModels} icon={<Bot size={16} />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: "CPU", value: cpuPct },
          { label: "RAM", value: ramPct },
          { label: "GPU VRAM", value: gpuPct },
          { label: "Disk", value: diskPct },
        ].map((r) => (
          <ProgressBar
            key={r.label}
            value={r.value}
            labelLeft={r.label}
            labelRight={`${r.value}%`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <Bot size={18} />, label: "LLM Runtime", href: "/node/llm" },
          { icon: <Users size={18} />, label: "Citizens", href: "/node/citizens" },
          { icon: <Container size={18} />, label: "Docker", href: "/node/docker" },
          { icon: <Terminal size={18} />, label: "Logs", href: "/node/logs" },
          { icon: <Settings size={18} />, label: "Config", href: "/node/config" },
        ].map((item) => (
          <Card
            key={item.label}
            className="flex flex-col items-center gap-2 py-4 cursor-pointer hover:border-accent/40 transition-all"
            onClick={() => navigate(item.href)}
          >
            <span className="text-accent">{item.icon}</span>
            <span className="text-sm text-text-secondary">{item.label}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}
