import {
  Container,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Cpu,
  Image,
  Network,
  Terminal,
  RotateCcw,
  Download,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Zap,
  AlertCircle,
  Plus,
  Eye,
  Activity,
  MonitorUp,
  Layers,
  ExternalLink,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { PageHeader, Card, Badge, Button, Alert, StatCard, Tabs, RpcStatus, ProgressBar } from "@/components/ui";
import { useRpc, rpc, mutateRpc } from "@/lib/rpc";
import { onWsMessage } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────────

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: "running" | "stopped" | "exited" | "creating" | "paused";
  state?: string;
  cpu?: number;
  memory?: string;
  ports?: string | string[];
  uptime?: string;
  created?: number;
  labels?: Record<string, string>;
}

interface DockerImage {
  id: string;
  tags?: string[];
  size?: number;
  created?: number;
}

interface DockerPreset {
  name: string;
  image: string;
  description?: string;
}

interface DockerNetwork {
  id: string;
  name: string;
  driver?: string;
  containers?: number;
}

interface ContainerDetail {
  id: string;
  name: string;
  image: string;
  created: string;
  state: {
    status: string;
    running: boolean;
    startedAt: string;
    finishedAt: string;
    exitCode: number;
    error: string;
  };
  config: {
    env: string[];
    cmd: string[];
    entrypoint: string[];
    workingDir: string;
    labels: Record<string, string>;
    exposedPorts: Record<string, unknown>;
  };
  hostConfig: {
    cpuLimit: string;
    memoryLimit: string;
    memoryRaw: number;
    restartPolicy: { Name: string; MaximumRetryCount: number };
    binds: string[];
    portBindings: Record<string, Array<{ HostIp: string; HostPort: string }>>;
    networkMode: string;
    devices: unknown[];
    runtime: string;
  };
  networkSettings: {
    networks: Record<string, unknown>;
    ports: Record<string, unknown>;
    ipAddress: string;
    gateway: string;
  };
  mounts: Array<{ Type: string; Source: string; Destination: string; Mode: string; RW: boolean }>;
}

interface ContainerStats {
  cpuPercent: number;
  memUsage: string;
  memLimit: string;
  memPercent: number;
  netIO: string;
  blockIO: string;
  pids: number;
}

interface PullProgress {
  pullId: string;
  image: string;
  status: "pulling" | "complete" | "failed";
  percent: number;
  detail?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  elapsedMs: number;
}

// ─── Constants ──────────────────────────────────────────────────

const STATUS_BADGE: Record<string, "success" | "neutral" | "danger" | "warning"> = {
  running: "success",
  stopped: "neutral",
  exited: "danger",
  creating: "warning",
  paused: "warning",
};

const TABS = [
  { id: "containers", label: "Containers" },
  { id: "images", label: "Images" },
  { id: "presets", label: "Presets" },
  { id: "create", label: "Create" },
  { id: "networks", label: "Networks" },
];

// ─── Helpers ────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;}
  if (bytes >= 1024 * 1024) {return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;}
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// ─── Pull Progress Banner ───────────────────────────────────────

function PullProgressBanner({ pulls }: { pulls: PullProgress[] }) {
  if (pulls.length === 0) {return null;}

  return (
    <div className="space-y-2">
      {pulls.map((p) => (
        <Card key={p.pullId} className="!p-3">
          <div className="flex items-center gap-3">
            <Download size={14} className={p.status === "pulling" ? "text-accent animate-bounce" : p.status === "complete" ? "text-success" : "text-danger"} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-text-primary truncate">{p.image}</span>
                <span className="text-[10px] text-text-muted flex-shrink-0">
                  {p.status === "pulling" && `${p.percent}% · ${fmtDuration(p.elapsedMs)}`}
                  {p.status === "complete" && `Done in ${fmtDuration(p.elapsedMs)}`}
                  {p.status === "failed" && "Failed"}
                </span>
              </div>
              {p.status === "pulling" && (
                <ProgressBar value={p.percent} max={100} size="sm" />
              )}
              {p.detail && p.status === "pulling" && (
                <p className="text-[10px] text-text-muted mt-0.5 font-mono truncate">{p.detail}</p>
              )}
            </div>
            {p.status === "complete" && <Badge variant="success">Complete</Badge>}
            {p.status === "failed" && <Badge variant="danger">Failed</Badge>}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Container Detail Panel ─────────────────────────────────────

function ContainerDetailPanel({
  containerId,
  containerName,
  onClose,
}: {
  containerId: string;
  containerName: string;
  onClose: () => void;
}) {
  const { data: inspectData, loading, error, refetch } = useRpc<{ container?: ContainerDetail }>(
    "republic.docker.containers.inspect",
    { id: containerId },
  );
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("overview");
  const [editCpu, setEditCpu] = useState("");
  const [editMem, setEditMem] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);

  const container = inspectData?.container;

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await rpc<{ stats?: ContainerStats }>("republic.docker.containers.stats", { id: containerId });
      setStats(res?.stats ?? null);
    } catch { setStats(null); }
    finally { setStatsLoading(false); }
  }, [containerId]);

  useEffect(() => {
    if (container?.state?.running) {fetchStats();}
  }, [container?.state?.running, fetchStats]);

  if (loading || error) {return <RpcStatus loading={loading} error={error} onRetry={refetch} />;}
  if (!container) {return null;}

  const detailTabs = [
    { id: "overview", label: "Overview" },
    { id: "env", label: "Environment" },
    { id: "ports", label: "Ports" },
    { id: "volumes", label: "Volumes" },
    { id: "resources", label: "Resources" },
    { id: "network", label: "Network" },
  ];

  async function updateResources() {
    if (!editCpu && !editMem) {return;}
    setUpdateBusy(true);
    try {
      await mutateRpc("republic.docker.containers.update", {
        id: containerId,
        ...(editCpu ? { cpuLimit: editCpu } : {}),
        ...(editMem ? { memoryLimit: editMem } : {}),
      });
      refetch();
    } catch (err) {
      console.error("[Docker] Update failed:", err);
    } finally {
      setUpdateBusy(false);
    }
  }

  async function openTerminal(action: "logs" | "shell") {
    try {
      await rpc("republic.docker.terminal", { action, container: containerName });
    } catch (err) {
      console.error("[Docker] Terminal open failed:", err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Eye size={18} className="text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-text-heading text-sm">{container.name}</h3>
              <p className="text-[11px] text-text-muted font-mono">{container.image}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={container.state.running ? "success" : "danger"}>
              {container.state.status}
            </Badge>
            <Button variant="ghost" size="sm" icon={<Terminal size={12} />} onClick={() => openTerminal("logs")} aria-label="Open live logs in terminal" />
            <Button variant="ghost" size="sm" icon={<MonitorUp size={12} />} onClick={() => openTerminal("shell")} aria-label="Open shell in terminal" />
            <Button variant="ghost" size="sm" icon={<X size={12} />} onClick={onClose} aria-label="Close detail panel" />
          </div>
        </div>

        {/* Stats bar for running containers */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 p-3 border-b border-border/30 bg-bg-secondary/50">
            <div className="text-center">
              <p className="text-[10px] text-text-muted">CPU</p>
              <p className="text-sm font-semibold text-text-heading">{stats.cpuPercent.toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-text-muted">Memory</p>
              <p className="text-sm font-semibold text-text-heading">{stats.memUsage} / {stats.memLimit}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-text-muted">Net I/O</p>
              <p className="text-sm font-semibold text-text-heading">{stats.netIO}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-text-muted">PIDs</p>
              <p className="text-sm font-semibold text-text-heading">{stats.pids}</p>
            </div>
          </div>
        )}
        {container.state.running && !stats && (
          <div className="p-2 border-b border-border/30 flex justify-center">
            <Button size="sm" variant="outline" icon={<Activity size={12} />} onClick={fetchStats} disabled={statsLoading}>
              {statsLoading ? "Loading stats…" : "Load Live Stats"}
            </Button>
          </div>
        )}

        {/* Detail tabs */}
        <div className="px-4 pt-2">
          <Tabs tabs={detailTabs} active={detailTab} onChange={setDetailTab} />
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {detailTab === "overview" && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <InfoRow label="Container ID" value={String(container.id).slice(0, 12)} mono />
              <InfoRow label="Created" value={new Date(container.created).toLocaleString()} />
              <InfoRow label="Started" value={container.state.startedAt ? new Date(container.state.startedAt).toLocaleString() : "—"} />
              <InfoRow label="Working Dir" value={container.config.workingDir || "/"} mono />
              <InfoRow label="Restart Policy" value={container.hostConfig.restartPolicy?.Name ?? "no"} />
              <InfoRow label="Network Mode" value={container.hostConfig.networkMode ?? "default"} />
              <InfoRow label="Runtime" value={container.hostConfig.runtime ?? "runc"} />
              <InfoRow label="Exit Code" value={String(container.state.exitCode ?? 0)} />
              {container.config.cmd && (
                <div className="col-span-2">
                  <InfoRow label="Command" value={(container.config.cmd ?? []).join(" ")} mono />
                </div>
              )}
              {container.config.entrypoint && (
                <div className="col-span-2">
                  <InfoRow label="Entrypoint" value={(container.config.entrypoint ?? []).join(" ")} mono />
                </div>
              )}
            </div>
          )}

          {detailTab === "env" && (
            <div className="space-y-1">
              {(container.config.env ?? []).length === 0 ? (
                <p className="text-text-muted text-xs text-center py-4">No environment variables set.</p>
              ) : (
                (container.config.env ?? []).map((e, i) => {
                  const [k, ...v] = e.split("=");
                  return (
                    <div key={i} className="flex gap-2 text-xs py-1 border-b border-border/20 last:border-0">
                      <span className="font-mono text-accent font-semibold min-w-[180px] truncate">{k}</span>
                      <span className="font-mono text-text-secondary truncate flex-1">{v.join("=")}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {detailTab === "ports" && (
            <div className="space-y-2">
              {container.hostConfig.portBindings && Object.keys(container.hostConfig.portBindings).length > 0 ? (
                Object.entries(container.hostConfig.portBindings).map(([containerPort, bindings]) => (
                  <Card key={containerPort} className="!p-2">
                    <div className="flex items-center gap-3 text-xs">
                      <Badge variant="info">{containerPort}</Badge>
                      <span className="text-text-muted">→</span>
                      {(bindings as Array<{ HostIp: string; HostPort: string }> ?? []).map((b, i) => (
                        <Badge key={i} variant="neutral">{b.HostIp || "0.0.0.0"}:{b.HostPort}</Badge>
                      ))}
                    </div>
                  </Card>
                ))
              ) : (
                <p className="text-text-muted text-xs text-center py-4">No port mappings configured.</p>
              )}
            </div>
          )}

          {detailTab === "volumes" && (
            <div className="space-y-2">
              {(container.mounts ?? []).length === 0 && (container.hostConfig.binds ?? []).length === 0 ? (
                <p className="text-text-muted text-xs text-center py-4">No volumes mounted.</p>
              ) : (
                <>
                  {(container.mounts ?? []).map((m, i) => (
                    <Card key={i} className="!p-2">
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant={m.RW ? "success" : "warning"}>{m.RW ? "RW" : "RO"}</Badge>
                        <Badge variant="neutral">{m.Type}</Badge>
                        <span className="font-mono text-text-secondary truncate">{m.Source}</span>
                        <span className="text-text-muted">→</span>
                        <span className="font-mono text-text-primary truncate">{m.Destination}</span>
                      </div>
                    </Card>
                  ))}
                  {(container.hostConfig.binds ?? []).filter(b => !(container.mounts ?? []).some(m => b.includes(m.Destination))).map((bind, i) => (
                    <Card key={`bind-${i}`} className="!p-2">
                      <span className="font-mono text-xs text-text-secondary">{bind}</span>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}

          {detailTab === "resources" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="CPU Limit" value={container.hostConfig.cpuLimit ? `${container.hostConfig.cpuLimit} cores` : "unlimited"} />
                <InfoRow label="Memory Limit" value={container.hostConfig.memoryLimit ?? "unlimited"} />
              </div>
              <Card className="space-y-3">
                <h4 className="text-xs font-semibold text-text-heading">Update Resources (live)</h4>
                <p className="text-[10px] text-text-muted">CPU and memory limits can be changed without restarting.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-text-muted mb-1 block">CPU Cores</label>
                    <input
                      className="w-full bg-bg-input border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono outline-none focus:border-accent"
                      placeholder={container.hostConfig.cpuLimit ?? "e.g. 2.0"}
                      value={editCpu}
                      onChange={(e) => setEditCpu(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted mb-1 block">Memory</label>
                    <input
                      className="w-full bg-bg-input border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono outline-none focus:border-accent"
                      placeholder={container.hostConfig.memoryLimit ?? "e.g. 4g"}
                      value={editMem}
                      onChange={(e) => setEditMem(e.target.value)}
                    />
                  </div>
                </div>
                <Button size="sm" disabled={(!editCpu && !editMem) || updateBusy} onClick={updateResources}>
                  {updateBusy ? "Updating…" : "Apply Changes"}
                </Button>
              </Card>
            </div>
          )}

          {detailTab === "network" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <InfoRow label="IP Address" value={container.networkSettings.ipAddress || "—"} mono />
                <InfoRow label="Gateway" value={container.networkSettings.gateway || "—"} mono />
                <InfoRow label="Network Mode" value={container.hostConfig.networkMode ?? "bridge"} />
              </div>
              {container.networkSettings.networks && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-text-heading">Connected Networks</h4>
                  {Object.entries(container.networkSettings.networks as Record<string, Record<string, unknown>>).map(([name, net]) => (
                    <Card key={name} className="!p-2">
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="info">{name}</Badge>
                        <span className="font-mono text-text-muted">{String(net?.IPAddress ?? "")}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-text-muted mb-0.5">{label}</p>
      <p className={`text-xs text-text-primary ${mono ? "font-mono" : ""} truncate`}>{value || "—"}</p>
    </div>
  );
}

// ─── Logs Modal ─────────────────────────────────────────────────

function LogsModal({
  containerId,
  containerName,
  onClose,
}: {
  containerId: string;
  containerName: string;
  onClose: () => void;
}) {
  const { data: logsData, refetch, loading, error } = useRpc<{ ok?: boolean; logs?: string }>(
    "republic.docker.containers.logs",
    { id: containerId, lines: 200 },
  );
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const lines = (logsData?.logs ?? "").split("\n").filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-accent" />
            <span className="font-semibold text-text-heading text-sm">Logs — {containerName}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<ExternalLink size={12} />} onClick={async () => {
              try { await rpc("republic.docker.terminal", { action: "logs", container: containerName }); } catch { /* ignore */ }
            }} aria-label="Open in PowerShell">
              Terminal
            </Button>
            <Button variant="outline" size="sm" icon={<RefreshCw size={12} />} onClick={refetch}>
              Refresh
            </Button>
            <Button variant="ghost" size="sm" icon={<X size={12} />} onClick={onClose} aria-label="Close logs" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-bg-secondary font-mono text-xs text-text-secondary space-y-0.5">
          {lines.length === 0 ? (
            <p className="text-text-muted text-center py-8">No log output available.</p>
          ) : (
            lines.map((line, i) => (
              <div
                key={i}
                className={`leading-5 ${line.includes("error") || line.includes("Error") ? "text-danger" : line.includes("warn") || line.includes("Warn") ? "text-warning" : ""}`}
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Container Card ───────────────────────────────────────────

function ContainerCard({ c, onRefetch, onInspect }: { c: DockerContainer; onRefetch: () => void; onInspect: (id: string, name: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [busy, setBusy] = useState(false);

  async function action(method: string, params: Record<string, unknown>) {
    setBusy(true);
    try {
      await rpc(method, params);
      setTimeout(onRefetch, 1200);
    } catch (err) {
      console.error(`[Docker] container action failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const ports = Array.isArray(c.ports) ? c.ports.join(", ") : (c.ports ?? "");
  const isRunning = c.status === "running";

  return (
    <>
      <Card className="space-y-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-xl flex-shrink-0">
            🐳
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-mono font-semibold text-text-heading text-sm truncate">{c.name}</p>
              <Badge variant={STATUS_BADGE[c.status] ?? "neutral"}>{c.status}</Badge>
              {c.labels?.["hoc.service"] && (
                <Badge variant="info" className="!text-[10px]">🏷 {c.labels["hoc.service"]}</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-text-muted">
              <span>📦 {c.image}</span>
              {ports && <span>🔌 {ports}</span>}
              {isRunning && c.cpu != null && <span>⚙️ {c.cpu}% CPU</span>}
              {isRunning && c.memory && <span>💾 {c.memory}</span>}
              {c.uptime && <span>⏱ {c.uptime}</span>}
              {c.labels?.["hoc.requested-by"] && (
                <span className="text-accent">👤 {c.labels["hoc.requested-by"]}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              icon={<Eye size={11} />}
              onClick={() => onInspect(c.id, c.name)}
              aria-label="Inspect container"
            />
            {isRunning ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Square size={11} />}
                  disabled={busy}
                  onClick={() => action("republic.docker.containers.stop", { id: c.id })}
                >
                  Stop
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RotateCcw size={11} />}
                  disabled={busy}
                  onClick={() => action("republic.docker.containers.restart", { id: c.id })}
                  aria-label="Restart container"
                />
              </>
            ) : (
              <Button
                size="sm"
                variant="primary"
                icon={<Play size={11} />}
                disabled={busy}
                onClick={() => action("republic.docker.containers.start", { id: c.id })}
              >
                Start
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<Terminal size={11} />}
              onClick={() => setShowLogs(true)}
              aria-label="View logs"
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={11} />}
              disabled={busy}
              onClick={() => action("republic.docker.containers.remove", { id: c.id, force: true })}
              aria-label="Remove container"
            />
            <Button
              size="sm"
              variant="ghost"
              icon={expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              onClick={() => setExpanded((v) => !v)}
              aria-label="Toggle details"
            />
          </div>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-muted">ID:</span>{" "}
              <span className="font-mono text-text-secondary">{c.id.slice(0, 12)}</span>
            </div>
            <div>
              <span className="text-text-muted">Image:</span>{" "}
              <span className="text-text-secondary">{c.image}</span>
            </div>
            {c.created && (
              <div>
                <span className="text-text-muted">Created:</span>{" "}
                <span className="text-text-secondary">
                  {new Date(c.created * 1000).toLocaleString()}
                </span>
              </div>
            )}
            {c.state && (
              <div>
                <span className="text-text-muted">State:</span>{" "}
                <span className="text-text-secondary">{c.state}</span>
              </div>
            )}
          </div>
        )}
      </Card>
      {showLogs && (
        <LogsModal containerId={c.id} containerName={c.name} onClose={() => setShowLogs(false)} />
      )}
    </>
  );
}

// ─── Create Container Form ──────────────────────────────────────

function CreateContainerForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [ports, setPorts] = useState("");
  const [volumes, setVolumes] = useState("");
  const [envVars, setEnvVars] = useState("");
  const [cpuLimit, setCpuLimit] = useState("1.0");
  const [memoryLimit, setMemoryLimit] = useState("1g");
  const [restartPolicy, setRestartPolicy] = useState("unless-stopped");
  const [gpus, setGpus] = useState("");
  const [command, setCommand] = useState("");
  const [network, setNetwork] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleCreate() {
    if (!name.trim() || !image.trim()) {return;}
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const parsedPorts = ports.split("\n").map(s => s.trim()).filter(Boolean);
      const parsedVolumes = volumes.split("\n").map(s => s.trim()).filter(Boolean);
      const parsedEnv: Record<string, string> = {};
      envVars.split("\n").forEach(line => {
        const [k, ...v] = line.split("=");
        if (k?.trim()) {parsedEnv[k.trim()] = v.join("=");}
      });
      const parsedCommand = command.trim() ? command.trim().split(/\s+/) : undefined;

      await rpc("republic.docker.containers.create", {
        name: name.trim(),
        image: image.trim(),
        ports: parsedPorts.length > 0 ? parsedPorts : undefined,
        volumes: parsedVolumes.length > 0 ? parsedVolumes : undefined,
        env: Object.keys(parsedEnv).length > 0 ? parsedEnv : undefined,
        cpuLimit,
        memoryLimit,
        restartPolicy,
        gpus: gpus || undefined,
        command: parsedCommand,
        network: network || undefined,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
      onCreated();
      // Reset form
      setName("");
      setImage("");
      setPorts("");
      setVolumes("");
      setEnvVars("");
      setCommand("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create container");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">Container created successfully!</Alert>}

      <Card className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Plus size={18} className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-heading">Create Custom Container</h3>
            <p className="text-[11px] text-text-muted">Full control over every Docker setting</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Name */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Container Name *</label>
            <input
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent"
              placeholder="my-container"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {/* Image */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Image *</label>
            <input
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent"
              placeholder="nginx:latest"
              value={image}
              onChange={(e) => setImage(e.target.value)}
            />
          </div>
          {/* CPU */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">CPU Cores</label>
            <input
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent"
              placeholder="1.0"
              value={cpuLimit}
              onChange={(e) => setCpuLimit(e.target.value)}
            />
          </div>
          {/* Memory */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Memory Limit</label>
            <input
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent"
              placeholder="1g, 512m"
              value={memoryLimit}
              onChange={(e) => setMemoryLimit(e.target.value)}
            />
          </div>
          {/* Restart Policy */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Restart Policy</label>
            <select
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              value={restartPolicy}
              onChange={(e) => setRestartPolicy(e.target.value)}
            >
              <option value="no">No</option>
              <option value="on-failure">On Failure</option>
              <option value="always">Always</option>
              <option value="unless-stopped">Unless Stopped</option>
            </select>
          </div>
          {/* GPU */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">GPU Passthrough</label>
            <select
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              value={gpus}
              onChange={(e) => setGpus(e.target.value)}
            >
              <option value="">None</option>
              <option value="all">All GPUs</option>
              <option value="device=0">GPU 0</option>
              <option value="device=1">GPU 1</option>
            </select>
          </div>
          {/* Network */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Network</label>
            <input
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent"
              placeholder="bridge (default)"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
            />
          </div>
          {/* Command */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Command Override</label>
            <input
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent"
              placeholder="sleep infinity"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
          </div>
        </div>

        {/* Multi-line fields */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Port Mappings (one per line)</label>
            <textarea
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono outline-none focus:border-accent resize-none h-24"
              placeholder={"8080:80\n3000:3000"}
              value={ports}
              onChange={(e) => setPorts(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Volume Mounts (one per line)</label>
            <textarea
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono outline-none focus:border-accent resize-none h-24"
              placeholder={"my-data:/data\n./config:/etc/config"}
              value={volumes}
              onChange={(e) => setVolumes(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Environment Variables (KEY=VALUE)</label>
            <textarea
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono outline-none focus:border-accent resize-none h-24"
              placeholder={"NODE_ENV=production\nPORT=3000"}
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            icon={busy ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            disabled={!name.trim() || !image.trim() || busy}
            onClick={handleCreate}
          >
            {busy ? "Creating…" : "Create Container"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export function DockerPage() {
  const [tab, setTab] = useState("containers");
  const [search, setSearch] = useState("");
  const [pulling, setPulling] = useState("");
  const [pullInput, setPullInput] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [launchingPreset, setLaunchingPreset] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<{ id: string; name: string } | null>(null);
  const [activePulls, setActivePulls] = useState<PullProgress[]>([]);

  const { data: containerData, refetch: refetchContainers } = useRpc<{
    ok?: boolean;
    containers?: DockerContainer[];
  }>("republic.docker.containers.list", { all: true });

  const { data: imageData, refetch: refetchImages } = useRpc<{
    ok?: boolean;
    images?: DockerImage[];
  }>("republic.docker.images.list");

  const { data: presetData } = useRpc<{
    ok?: boolean;
    presets?: DockerPreset[];
  }>("republic.docker.presets.list");

  const { data: networkData, refetch: refetchNetworks } = useRpc<{
    ok?: boolean;
    networks?: DockerNetwork[];
  }>("republic.docker.networks.list");

  const { data: availData } = useRpc<{ ok?: boolean; available?: boolean }>(
    "republic.docker.available",
  );

  // Subscribe to pull progress WS events
  useEffect(() => {
    const unsub = onWsMessage((msg) => {
      if (msg.type !== "event") {return;}
      const event = msg.event as string | undefined;
      const payload = (msg.payload ?? msg.data) as Record<string, unknown> | undefined;
      if (!payload) {return;}

      if (event === "docker_pull_progress" || event === "docker_pull_started" || event === "docker_pull_complete" || event === "docker_pull_failed") {
        const pullId = payload.pullId as string;
        if (!pullId) {return;}

        setActivePulls(prev => {
          const existing = prev.findIndex(p => p.pullId === pullId);
          const updated: PullProgress = {
            pullId,
            image: (payload.image as string) ?? "",
            status: event === "docker_pull_complete" ? "complete" : event === "docker_pull_failed" ? "failed" : "pulling",
            percent: (payload.percent as number) ?? 0,
            detail: (payload.detail as string) ?? undefined,
            downloadedBytes: payload.downloadedBytes as number | undefined,
            totalBytes: payload.totalBytes as number | undefined,
            elapsedMs: (payload.elapsedMs as number) ?? 0,
          };

          if (existing >= 0) {
            const next = [...prev];
            next[existing] = updated;
            return next;
          }
          return [...prev, updated];
        });

        // Auto-remove completed/failed pulls after 10s
        if (event === "docker_pull_complete" || event === "docker_pull_failed") {
          setTimeout(() => {
            setActivePulls(prev => prev.filter(p => p.pullId !== pullId));
          }, 10_000);
          // Refresh images list on completion
          if (event === "docker_pull_complete") {
            setTimeout(refetchImages, 2000);
          }
        }
      }
    });
    return unsub;
  }, [refetchImages]);

  const containers = containerData?.containers ?? [];
  const images = imageData?.images ?? [];
  const presets = presetData?.presets ?? [];
  const networks = networkData?.networks ?? [];
  const available = availData?.available ?? true;

  const filtered = containers.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.image.toLowerCase().includes(search.toLowerCase()),
  );

  async function pullImageAction(useStreaming = false) {
    if (!pullInput.trim()) {return;}
    setMutationError(null);

    if (useStreaming) {
      // Use streaming pull — returns immediately, progress via WS
      try {
        await rpc("republic.docker.pull.stream", { image: pullInput.trim() });
        setPullInput("");
      } catch (err) {
        setMutationError(err instanceof Error ? err.message : "Failed to start pull");
      }
      return;
    }

    setPulling(pullInput);
    try {
      await rpc("republic.docker.images.pull", { image: pullInput.trim() });
      setTimeout(refetchImages, 2000);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to pull image");
    } finally {
      setPulling("");
      setPullInput("");
    }
  }

  async function openPullTerminal() {
    if (!pullInput.trim()) {return;}
    try {
      await rpc("republic.docker.terminal", { action: "pull", image: pullInput.trim() });
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to open terminal");
    }
  }

  async function launchPreset(name: string) {
    setMutationError(null);
    setLaunchSuccess(null);
    setLaunchingPreset(name);
    try {
      // Docker preset launches can take a long time (image pulls up to 15GB)
      // rpc.ts classifies this as VERY_LONG_RUNNING (900s timeout)
      await rpc("republic.docker.presets.launch", { name });
      setLaunchSuccess(name);
      setTimeout(() => setLaunchSuccess(null), 5000);
      setTimeout(refetchContainers, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to launch preset ${name}`;
      setMutationError(msg.includes("timed out")
        ? `Launch timed out — the image may still be pulling in the background. Try refreshing in a few minutes.`
        : msg);
    } finally {
      setLaunchingPreset(null);
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {mutationError && <Alert variant="danger">{mutationError}</Alert>}
      {launchSuccess && <Alert variant="success">Preset "{launchSuccess}" launched successfully! Container is starting up.</Alert>}

      <PageHeader
        title="Docker"
        description="Full container lifecycle management — create, configure, monitor, and control"
        icon={<Container size={28} />}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => {
                refetchContainers();
                refetchImages();
                refetchNetworks();
              }}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {!available && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} />
          Docker is not available or not running on this machine.
        </div>
      )}

      {/* Active pull progress */}
      <PullProgressBanner pulls={activePulls} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Running"
          value={containers.filter((c) => c.status === "running").length}
          sub="Active containers"
          icon={<Container size={16} />}
        />
        <StatCard
          label="Total"
          value={containers.length}
          sub="All containers"
          icon={<Layers size={16} />}
        />
        <StatCard
          label="Images"
          value={images.length}
          sub="Pulled locally"
          icon={<Image size={16} />}
        />
        <StatCard
          label="CPU Usage"
          value={`${containers
            .filter((c) => c.status === "running")
            .reduce((s, c) => s + (c.cpu ?? 0), 0)
            .toFixed(1)}%`}
          sub="Running containers"
          icon={<Cpu size={16} />}
        />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* Containers tab */}
      {tab === "containers" && (
        <div className="space-y-3">
          <div className="relative w-72">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              className="w-full bg-bg-input border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
              placeholder="Search containers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Container size={36} className="text-text-muted/30" />
                <p className="text-text-muted text-sm">
                  {containers.length === 0
                    ? "No containers found. Docker may not be running."
                    : "No containers match your search."}
                </p>
              </div>
            </Card>
          ) : (
            filtered.map((c) => (
              <ContainerCard
                key={c.id}
                c={c}
                onRefetch={refetchContainers}
                onInspect={(id, name) => setInspecting({ id, name })}
              />
            ))
          )}
        </div>
      )}

      {/* Images tab */}
      {tab === "images" && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-text-heading">Pull Image</h3>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent font-mono"
                placeholder="e.g. nginx:latest, postgres:16-alpine"
                value={pullInput}
                onChange={(e) => setPullInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && pullImageAction(true)}
              />
              <Button
                icon={<Download size={14} />}
                disabled={!pullInput.trim() || !!pulling}
                onClick={() => pullImageAction(true)}
              >
                {pulling ? "Pulling…" : "Pull"}
              </Button>
              <Button
                variant="outline"
                icon={<ExternalLink size={14} />}
                disabled={!pullInput.trim()}
                onClick={openPullTerminal}
                aria-label="Pull in PowerShell terminal"
              >
                Terminal
              </Button>
            </div>
            <p className="text-[10px] text-text-muted">
              💡 Use "Terminal" to open a PowerShell window with real-time download progress
            </p>
          </Card>
          <div className="space-y-2">
            {images.map((img) => (
              <Card key={img.id}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <Image size={14} className="text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-mono font-medium text-text-primary">
                        {img.tags?.[0] ?? img.id.slice(7, 19)}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {img.size ? fmtBytes(img.size) : ""}{" "}
                        {img.created
                          ? `· ${new Date(img.created * 1000).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={12} />}
                    onClick={async () => {
                      await rpc("republic.docker.images.remove", { image: img.id });
                      setTimeout(refetchImages, 800);
                    }}
                    aria-label="Remove image"
                  />
                </div>
              </Card>
            ))}
            {images.length === 0 && (
              <Card>
                <p className="text-center text-text-muted text-sm py-8">No images found locally.</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Presets tab */}
      {tab === "presets" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets.map((p) => (
            <Card key={p.name} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <Zap size={16} className="text-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-text-heading text-sm">{p.name}</p>
                  <p className="text-[11px] text-text-muted font-mono">{p.image}</p>
                </div>
              </div>
              {p.description && <p className="text-xs text-text-secondary">{p.description}</p>}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  icon={launchingPreset === p.name ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                  className="flex-1"
                  disabled={launchingPreset !== null}
                  onClick={() => launchPreset(p.name)}
                >
                  {launchingPreset === p.name ? "Launching…" : "Launch"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<ExternalLink size={12} />}
                  onClick={async () => {
                    try { await rpc("republic.docker.terminal", { action: "pull", image: p.image }); } catch { /* ignore */ }
                  }}
                  aria-label="Pull image in terminal"
                >
                  Pull
                </Button>
              </div>
            </Card>
          ))}
          {presets.length === 0 && (
            <div className="col-span-3">
              <Card>
                <p className="text-center text-text-muted text-sm py-8">No presets defined.</p>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Create tab */}
      {tab === "create" && (
        <CreateContainerForm onCreated={() => {
          refetchContainers();
          setTimeout(() => setTab("containers"), 500);
        }} />
      )}

      {/* Networks tab */}
      {tab === "networks" && (
        <div className="space-y-2">
          {networks.map((n) => (
            <Card key={n.id}>
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Network size={14} className="text-cyan-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-text-primary text-sm">{n.name}</p>
                  <p className="text-xs text-text-muted">
                    {n.driver ?? "bridge"} · {n.id.slice(0, 12)}
                  </p>
                </div>
                {n.containers != null && <Badge variant="neutral">{n.containers} containers</Badge>}
              </div>
            </Card>
          ))}
          {networks.length === 0 && (
            <Card>
              <p className="text-center text-text-muted text-sm py-8">No networks found.</p>
            </Card>
          )}
        </div>
      )}

      {/* Container detail panel */}
      {inspecting && (
        <ContainerDetailPanel
          containerId={inspecting.id}
          containerName={inspecting.name}
          onClose={() => setInspecting(null)}
        />
      )}
    </div>
  );
}
