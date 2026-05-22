import {
  Container,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Cpu,
  HardDrive,
  Terminal,
  RotateCcw,
  Download,
  X,
  Server,
  Zap,
  Shield,
  Bot,
  Search,
  ChevronDown,
  ChevronUp,
  MonitorDot,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Alert,
  StatCard,
  Tabs,
  ProgressBar,
  RpcStatus,
  EmptyState,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface GatewayNode {
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  remoteIp?: string;
  caps?: string[];
  connected: boolean;
  paired: boolean;
}

interface NodeContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state?: string;
  ports?: string;
  uptime?: string;
  labels?: Record<string, string>;
  nodeId?: string;
}

interface NodePreset {
  name: string;
  image: string;
  description?: string;
  gpu?: boolean;
  category?: string;
}

interface NodeDockerStatus {
  ok?: boolean;
  available?: boolean;
  error?: string;
  budget?: {
    maxCpuCores: number;
    maxMemoryGB: number;
    maxContainers: number;
    allocatedCpuCores: number;
    allocatedMemoryGB: number;
    activeContainers: number;
  };
}

// ─── Constants ──────────────────────────────────────────────────

const STATUS_BADGE: Record<string, "success" | "neutral" | "danger" | "warning"> = {
  running: "success",
  stopped: "neutral",
  exited: "danger",
  creating: "warning",
  paused: "warning",
};

const CATEGORY_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  infra: { icon: <Server size={16} />, label: "Infrastructure", color: "text-info" },
  gpu: { icon: <Zap size={16} />, label: "GPU / Creative", color: "text-purple" },
  agent: { icon: <Bot size={16} />, label: "Agents", color: "text-accent" },
  security: { icon: <Shield size={16} />, label: "Security", color: "text-danger" },
  other: { icon: <Container size={16} />, label: "Other", color: "text-text-secondary" },
};

const TABS = [
  { id: "containers", label: "Containers" },
  { id: "presets", label: "Presets" },
  { id: "images", label: "Images" },
];

// ─── Logs Modal ─────────────────────────────────────────────────

function LogsModal({
  containerId,
  containerName,
  nodeId,
  onClose,
}: {
  containerId: string;
  containerName: string;
  nodeId: string;
  onClose: () => void;
}) {
  const {
    data: logsData,
    refetch,
    loading,
    error,
  } = useRpc<{ ok?: boolean; logs?: string }>("republic.node.docker.containers.logs", {
    nodeId,
    id: containerId,
    lines: 200,
  });
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
            <Button variant="outline" size="sm" icon={<RefreshCw size={12} />} onClick={refetch}>
              Refresh
            </Button>
            <Button variant="ghost" size="sm" icon={<X size={12} />} onClick={onClose} aria-label="Close" />
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

// ─── Container Card ─────────────────────────────────────────────

function RemoteContainerCard({
  c,
  nodeId,
  onRefetch,
}: {
  c: NodeContainer;
  nodeId: string;
  onRefetch: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [busy, setBusy] = useState(false);

  async function action(method: string, params: Record<string, unknown>) {
    setBusy(true);
    try {
      await rpc(method, { nodeId, ...params });
      setTimeout(onRefetch, 1200);
    } catch (err) {
      console.error(`[NodeDocker] action failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const isRunning = c.status === "running";
  const ports = typeof c.ports === "string" ? c.ports : "";

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
                <Badge variant="info" className="!text-[10px]">
                  🏷 {c.labels["hoc.service"]}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-text-muted">
              <span>📦 {c.image}</span>
              {ports && <span>🔌 {ports}</span>}
              {c.uptime && <span>⏱ {c.uptime}</span>}
              {c.labels?.["hoc.requested-by"] && (
                <span className="text-accent">👤 {c.labels["hoc.requested-by"]}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isRunning ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Square size={11} />}
                  disabled={busy}
                  onClick={() =>
                    action("republic.node.docker.containers.stop", { id: c.id })
                  }
                >
                  Stop
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RotateCcw size={11} />}
                  disabled={busy}
                  aria-label="Restart"
                  onClick={() =>
                    action("republic.node.docker.containers.start", { id: c.id })
                  }
                />
              </>
            ) : (
              <Button
                size="sm"
                variant="primary"
                icon={<Play size={11} />}
                disabled={busy}
                onClick={() =>
                  action("republic.node.docker.containers.start", { id: c.id })
                }
              >
                Start
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<Terminal size={11} />}
              aria-label="Logs"
              onClick={() => setShowLogs(true)}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={11} />}
              disabled={busy}
              aria-label="Remove"
              onClick={() =>
                action("republic.node.docker.containers.remove", { id: c.id, force: true })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              icon={expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              aria-label="Expand"
              onClick={() => setExpanded((v) => !v)}
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
        <LogsModal
          containerId={c.id}
          containerName={c.name}
          nodeId={nodeId}
          onClose={() => setShowLogs(false)}
        />
      )}
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export function NodeDockerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialNodeId = searchParams.get("nodeId") ?? "local";
  const [selectedNode, setSelectedNode] = useState(initialNodeId);
  const [tab, setTab] = useState("containers");
  const [search, setSearch] = useState("");
  const [pullInput, setPullInput] = useState("");
  const [pulling, setPulling] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // ── Data hooks (ALL declared before any conditional returns) ──
  const {
    data: nodesData,
    loading: nodesLoading,
    error: nodesError,
    refetch: refetchNodes,
  } = useRpc<{ nodes: GatewayNode[] }>("node.list", {}, [], { staleTimeMs: 30000 });

  const {
    data: dockerStatus,
    refetch: refetchStatus,
  } = useRpc<NodeDockerStatus>("republic.node.docker.status", { nodeId: selectedNode }, [selectedNode], {
    staleTimeMs: 10000,
    refetchIntervalMs: 15000,
  });

  const {
    data: containerData,
    refetch: refetchContainers,
  } = useRpc<{ ok?: boolean; containers?: NodeContainer[] }>(
    "republic.node.docker.containers.list",
    { nodeId: selectedNode },
    [selectedNode],
    { staleTimeMs: 10000, refetchIntervalMs: 15000 },
  );

  const { data: presetData } = useRpc<{ ok?: boolean; presets?: NodePreset[] }>(
    "republic.node.docker.presets.list",
    { nodeId: selectedNode },
    [selectedNode],
  );

  const { data: imageData, refetch: refetchImages } = useRpc<{
    ok?: boolean;
    images?: { id: string; tags?: string[]; size?: number; created?: number }[];
  }>("republic.node.docker.images.list", { nodeId: selectedNode }, [selectedNode]);

  // ── Loading guard ──
  if (nodesLoading || nodesError) {
    return <RpcStatus loading={nodesLoading} error={nodesError} onRetry={refetchNodes} />;
  }

  // ── Derived data ──
  const nodes = nodesData?.nodes ?? [];
  const containers = containerData?.containers ?? [];
  const presets = presetData?.presets ?? [];
  const images = imageData?.images ?? [];
  const budget = dockerStatus?.budget;
  const dockerAvailable = dockerStatus?.available ?? true;

  const cpuPct =
    budget && budget.maxCpuCores > 0
      ? Math.round((budget.allocatedCpuCores / budget.maxCpuCores) * 100)
      : 0;
  const memPct =
    budget && budget.maxMemoryGB > 0
      ? Math.round((budget.allocatedMemoryGB / budget.maxMemoryGB) * 100)
      : 0;

  const filtered = containers.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.image.toLowerCase().includes(search.toLowerCase()),
  );

  // Group presets by category
  const presetsByCategory = presets.reduce(
    (acc, p) => {
      const cat = p.category ?? "other";
      if (!acc[cat]) { acc[cat] = []; }
      acc[cat].push(p);
      return acc;
    },
    {} as Record<string, NodePreset[]>,
  );

  // ── Handlers ──
  function selectNode(nodeId: string) {
    setSelectedNode(nodeId);
    setSearchParams({ nodeId });
  }

  async function launchPreset(name: string) {
    setMutationError(null);
    try {
      await rpc("republic.node.docker.presets.launch", {
        nodeId: selectedNode,
        name,
        requestedBy: "gateway-ui",
      });
      setTimeout(refetchContainers, 2000);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : `Failed to launch ${name}`);
    }
  }

  async function pullImageAction() {
    if (!pullInput.trim()) { return; }
    setPulling(true);
    setMutationError(null);
    try {
      await rpc("republic.node.docker.images.pull", {
        nodeId: selectedNode,
        image: pullInput.trim(),
      });
      setTimeout(refetchImages, 2000);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to pull image");
    } finally {
      setPulling(false);
      setPullInput("");
    }
  }

  function refetchAll() {
    refetchStatus();
    refetchContainers();
    refetchImages();
  }

  // ── Selected node info ──
  const selectedNodeInfo = selectedNode === "local"
    ? { displayName: "Gateway (Local)", platform: "local", connected: true }
    : nodes.find((n) => n.nodeId === selectedNode);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {mutationError && <Alert variant="danger">{mutationError}</Alert>}

      <PageHeader
        title="Node Docker"
        description="Remote Docker management across connected compute nodes"
        icon={<Container size={28} />}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={refetchAll}
          >
            Refresh
          </Button>
        }
      />

      {/* ── Node Selector ── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => selectNode("local")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            selectedNode === "local"
              ? "bg-accent/10 border-accent/40 text-accent shadow-lg shadow-accent/5"
              : "bg-bg-card border-border text-text-secondary hover:border-border-hover"
          }`}
        >
          <MonitorDot size={14} />
          <span>Gateway (Local)</span>
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
        </button>
        {nodes
          .filter((n) => n.connected && n.paired)
          .map((node) => (
            <button
              key={node.nodeId}
              onClick={() => selectNode(node.nodeId)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                selectedNode === node.nodeId
                  ? "bg-accent/10 border-accent/40 text-accent shadow-lg shadow-accent/5"
                  : "bg-bg-card border-border text-text-secondary hover:border-border-hover"
              }`}
            >
              <Server size={14} />
              <span>{node.displayName ?? node.nodeId}</span>
              {node.remoteIp && (
                <span className="text-[10px] text-text-muted">{node.remoteIp}</span>
              )}
              <span
                className={`w-2 h-2 rounded-full ${node.connected ? "bg-success animate-pulse" : "bg-neutral"}`}
              />
            </button>
          ))}
      </div>

      {/* ── Docker Status ── */}
      {!dockerAvailable && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} />
          Docker is not available on{" "}
          {selectedNodeInfo?.displayName ?? selectedNode}.
          {dockerStatus?.error && ` Error: ${dockerStatus.error}`}
        </div>
      )}

      {/* ── Resource Budget ── */}
      {budget && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Running"
            value={containers.filter((c) => c.status === "running").length}
            sub={`of ${budget.maxContainers} max`}
            icon={<Container size={16} />}
          />
          <StatCard
            label="CPU Budget"
            value={`${budget.allocatedCpuCores.toFixed(1)} / ${budget.maxCpuCores}`}
            sub="Cores allocated"
            icon={<Cpu size={16} />}
          />
          <StatCard
            label="Memory Budget"
            value={`${budget.allocatedMemoryGB.toFixed(1)} / ${budget.maxMemoryGB} GB`}
            sub="RAM allocated"
            icon={<HardDrive size={16} />}
          />
          <StatCard
            label="Total Containers"
            value={containers.length}
            sub="All states"
            icon={<Container size={16} />}
          />
        </div>
      )}

      {budget && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProgressBar value={cpuPct} labelLeft="CPU Budget" labelRight={`${cpuPct}%`} />
          <ProgressBar value={memPct} labelLeft="Memory Budget" labelRight={`${memPct}%`} />
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* ── Containers Tab ── */}
      {tab === "containers" && (
        <div className="space-y-3">
          <div className="relative w-72">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              className="w-full bg-bg-input border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
              placeholder="Search containers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Container size={36} />}
              title="No containers"
              description={
                containers.length === 0
                  ? "No containers on this node. Launch a preset to get started."
                  : "No containers match your search."
              }
            />
          ) : (
            filtered.map((c) => (
              <RemoteContainerCard
                key={c.id}
                c={c}
                nodeId={selectedNode}
                onRefetch={refetchContainers}
              />
            ))
          )}
        </div>
      )}

      {/* ── Presets Tab ── */}
      {tab === "presets" && (
        <div className="space-y-6">
          {Object.entries(presetsByCategory).map(([category, categoryPresets]) => {
            const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={meta.color}>{meta.icon}</span>
                  <h3 className="text-sm font-semibold text-text-heading">{meta.label}</h3>
                  <Badge variant="neutral">{categoryPresets.length}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryPresets.map((p) => (
                    <Card
                      key={p.name}
                      className={`space-y-3 ${p.gpu ? "border-purple/30" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            p.gpu ? "bg-purple/10" : "bg-accent/10"
                          }`}
                        >
                          {p.gpu ? (
                            <Zap size={16} className="text-purple" />
                          ) : (
                            <Container size={16} className="text-accent" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-text-heading text-sm">{p.name}</p>
                            {p.gpu && <Badge variant="purple">GPU</Badge>}
                          </div>
                          <p className="text-[11px] text-text-muted font-mono truncate">
                            {p.image}
                          </p>
                        </div>
                      </div>
                      {p.description && (
                        <p className="text-xs text-text-secondary">{p.description}</p>
                      )}
                      <Button
                        size="sm"
                        icon={<Play size={12} />}
                        className="w-full"
                        onClick={() => launchPreset(p.name)}
                      >
                        Launch on{" "}
                        {selectedNode === "local"
                          ? "Local"
                          : (selectedNodeInfo?.displayName ?? selectedNode)}
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
          {presets.length === 0 && (
            <EmptyState
              icon={<Zap size={36} />}
              title="No presets available"
              description="Docker presets are not available on this node."
            />
          )}
        </div>
      )}

      {/* ── Images Tab ── */}
      {tab === "images" && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-text-heading">Pull Image</h3>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 font-mono"
                placeholder="e.g. nginx:latest, postgres:16-alpine"
                value={pullInput}
                onChange={(e) => setPullInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && pullImageAction()}
              />
              <Button
                icon={<Download size={14} />}
                disabled={!pullInput.trim() || pulling}
                onClick={pullImageAction}
              >
                {pulling ? "Pulling…" : "Pull"}
              </Button>
            </div>
          </Card>
          <div className="space-y-2">
            {(images).map((img) => (
              <Card key={img.id}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple/10 flex items-center justify-center">
                      <HardDrive size={14} className="text-purple" />
                    </div>
                    <div>
                      <p className="text-sm font-mono font-medium text-text-primary">
                        {img.tags?.[0] ?? img.id.slice(7, 19)}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {img.size ? `${(img.size / 1024 / 1024).toFixed(0)} MB` : ""}{" "}
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
                    aria-label="Remove image"
                    onClick={async () => {
                      await rpc("republic.node.docker.images.remove", {
                        nodeId: selectedNode,
                        image: img.id,
                        force: true,
                      });
                      setTimeout(refetchImages, 800);
                    }}
                  />
                </div>
              </Card>
            ))}
            {images.length === 0 && (
              <EmptyState
                icon={<HardDrive size={36} />}
                title="No images"
                description="No Docker images found on this node."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
