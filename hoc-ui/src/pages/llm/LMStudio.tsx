import {
  Server,
  Cpu,
  Zap,
  RefreshCw,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  Radio,
  Network,
  LogIn,
  ToggleLeft,
  ToggleRight,
  Route,
  Package,
  AlertCircle,
  CheckCircle,
  Layers,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  StatCard,
  Tabs,
  RpcStatus,
  EmptyState,
  Alert,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface LMLinkNode {
  id: string;
  label: string;
  host: string;
  port: number;
  status: "online" | "offline" | "unknown";
  latencyMs: number | null;
  dockerHostUrl?: string;
  gpuProfile: string;
  gpuProfileLabel: string;
  isLocal: boolean;
  isPowerNode: boolean;
  modelCount: number;
  loadedModelCount: number;
  lastProbeMs: number;
  addedAt: number;
}

interface AggregatedModel {
  key: string;
  displayName: string;
  type: string;
  loaded: boolean;
  vision: boolean;
  toolUse: boolean;
  contextLength: number;
  architecture: string | null;
  quantization: string | null;
  nodeId: string;
  nodeLabel: string;
  nodeStatus: string;
  gpuProfile: string;
  sizeBytes: number;
}

interface RoutingConfig {
  preferredNodeId: string | null;
  strategy: "auto" | "manual";
  fallbackToLocal: boolean;
}

// ─── GPU Profile Colors ──────────────────────────────────────────

function gpuBadgeVariant(profile: string): "success" | "info" | "purple" | "warning" | "neutral" {
  if (profile.includes("6000-pro")) { return "purple"; }
  if (profile.includes("4090") || profile.includes("5070")) { return "success"; }
  if (profile.includes("3090")) { return "info"; }
  if (profile === "default") { return "neutral"; }
  return "neutral";
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) { return "?"; }
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) { return `${gb.toFixed(1)} GB`; }
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

// ─── Add Node Form ───────────────────────────────────────────────

interface AddNodeFormProps {
  onAdded: () => void;
}

function AddNodeForm({ onAdded }: AddNodeFormProps) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("1234");
  const [label, setLabel] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [dockerHostUrl, setDockerHostUrl] = useState("");
  const [gpuProfile, setGpuProfile] = useState("default");
  const [isPowerNode, setIsPowerNode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const GPU_PROFILES = [
    { key: "default", label: "Unknown / Default" },
    { key: "rtx-6000-pro-96gb", label: "RTX 6000 Pro 96 GB (Blackwell)" },
    { key: "rtx-4090-24gb", label: "RTX 4090 24 GB" },
    { key: "rtx-3090-24gb", label: "RTX 3090 24 GB" },
    { key: "rtx-5070-8gb", label: "RTX 5070 8 GB" },
  ];

  async function handleAdd() {
    if (!host.trim()) {
      setError("Host is required");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await rpc("republic.lmlink.nodes.add", {
        host: host.trim(),
        port: parseInt(port, 10) || 1234,
        label: label.trim() || undefined,
        apiToken: apiToken.trim() || undefined,
        dockerHostUrl: dockerHostUrl.trim() || undefined,
        gpuProfile,
        isPowerNode,
      });
      setHost("");
      setPort("1234");
      setLabel("");
      setApiToken("");
      setDockerHostUrl("");
      setGpuProfile("default");
      setIsPowerNode(false);
      onAdded();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-accent/30">
      <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
        <Plus size={16} className="text-accent" />
        Add Remote LM Studio Node
      </h3>

      {error && (
        <div className="mb-3 p-2 rounded bg-danger-bg border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-text-muted mb-1 block">Host / IP *</label>
          <input
            id="lmlink-add-host"
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            placeholder="192.168.1.100 or hostname"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">Port</label>
          <input
            id="lmlink-add-port"
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            placeholder="1234"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">Label</label>
          <input
            id="lmlink-add-label"
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            placeholder="e.g. RTX Server, Home PC"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">API Token (optional)</label>
          <input
            id="lmlink-add-token"
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            placeholder="lm-studio-token"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            type="password"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">Docker Host URL (optional)</label>
          <input
            id="lmlink-add-docker"
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            placeholder="e.g. tcp://100.x.y.z:2375"
            value={dockerHostUrl}
            onChange={(e) => setDockerHostUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">GPU Profile</label>
          <select
            id="lmlink-add-gpu"
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            value={gpuProfile}
            onChange={(e) => setGpuProfile(e.target.value)}
          >
            {GPU_PROFILES.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input
            id="lmlink-add-powernode"
            type="checkbox"
            checked={isPowerNode}
            onChange={(e) => setIsPowerNode(e.target.checked)}
            className="w-4 h-4 accent-purple-500"
          />
          <label htmlFor="lmlink-add-powernode" className="text-sm text-text-secondary">
            Mark as Power Node ⚡
          </label>
        </div>
      </div>

      <Button variant="primary" onClick={handleAdd} disabled={submitting} icon={<Plus size={14} />}>
        {submitting ? "Adding…" : "Add Node"}
      </Button>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

export function LMStudioPage() {
  // ─── All hooks at the top ───────────────────────────────────
  const [activeTab, setActiveTab] = useState("overview");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const {
    data: statusData,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useRpc<{
    ok: boolean;
    nodeCount: number;
    onlineCount: number;
    totalModels: number;
    loadedModels: number;
    routingConfig: RoutingConfig;
    selectedNode: { id: string; label: string; gpuProfile: string } | null;
    cli: { available: boolean; lmLinkEnabled: boolean | null; linkedDevices: string[] };
  }>("republic.lmlink.status", {}, [], { staleTimeMs: 5000, refetchIntervalMs: 15000 });

  const {
    data: nodesData,
    loading: nodesLoading,
    error: nodesError,
    refetch: refetchNodes,
  } = useRpc<{
    nodes: LMLinkNode[];
    totalCount: number;
    onlineCount: number;
  }>("republic.lmlink.nodes.list", {}, [], { staleTimeMs: 5000, refetchIntervalMs: 15000 });

  const {
    data: modelsData,
    loading: modelsLoading,
    error: modelsError,
    refetch: refetchModels,
  } = useRpc<{
    models: AggregatedModel[];
    totalCount: number;
    loadedCount: number;
  }>("republic.lmlink.models.list", {}, [], { staleTimeMs: 10000, refetchIntervalMs: 20000 });

  const {
    data: routingData,
    loading: routingLoading,
    error: routingError,
    refetch: refetchRouting,
  } = useRpc<{
    routingConfig: RoutingConfig;
    selectedNode: {
      id: string;
      label: string;
      host: string;
      port: number;
      status: string;
      latencyMs: number | null;
      gpuProfile: string;
      isPowerNode: boolean;
    } | null;
    onlineNodes: Array<{
      id: string;
      label: string;
      latencyMs: number | null;
      isPowerNode: boolean;
      loadedModelCount: number;
    }>;
  }>("republic.lmlink.routing.status", {}, [], { staleTimeMs: 5000, refetchIntervalMs: 15000 });

  // Local LMS health for backward compat
  const { data: lmsHealth } = useRpc<{
    online: boolean;
    loadedModel?: string | null;
    modelCount?: number;
    models?: string[];
  }>("republic.lmstudio.health", {}, [], { staleTimeMs: 10000, refetchIntervalMs: 30000 });

  // Keep preferred node selection in local state
  const [selectedPreferredNode, setSelectedPreferredNode] = useState<string>("");

  useEffect(() => {
    if (routingData?.routingConfig.preferredNodeId) {
      setSelectedPreferredNode(routingData.routingConfig.preferredNodeId);
    }
  }, [routingData]);

  // Loading/error guard — only block on status (primary data)
  if (statusLoading || statusError) {
    return <RpcStatus loading={statusLoading} error={statusError} onRetry={refetchStatus} />;
  }

  const nodes = nodesData?.nodes ?? [];
  const models = modelsData?.models ?? [];
  const routingCfg = routingData?.routingConfig;
  const onlineNodes = routingData?.onlineNodes ?? [];

  // ─── Actions ──────────────────────────────────────────────

  async function handleEnableLink() {
    setActionLoading("enable");
    try {
      await rpc("republic.lmlink.link.enable", {});
      refetchStatus();
    } catch { /* error shown in UI state */ }
    finally { setActionLoading(null); }
  }

  async function handleDisableLink() {
    setActionLoading("disable");
    try {
      await rpc("republic.lmlink.link.disable", {});
      refetchStatus();
    } catch { /* error shown in UI state */ }
    finally { setActionLoading(null); }
  }

  async function handleLogin() {
    setActionLoading("login");
    try {
      await rpc("republic.lmlink.link.login", {});
    } catch { /* error shown in UI state */ }
    finally { setActionLoading(null); }
  }

  async function handleRemoveNode(nodeId: string) {
    setActionLoading(`remove-${nodeId}`);
    try {
      await rpc("republic.lmlink.nodes.remove", { nodeId });
      refetchNodes();
      refetchStatus();
    } catch { /* error shown in UI state */ }
    finally { setActionLoading(null); }
  }

  async function handleProbeAll() {
    setActionLoading("probe");
    try {
      await rpc("republic.lmlink.nodes.probe", {});
      refetchNodes();
      refetchStatus();
      refetchModels();
    } catch { /* error shown in UI state */ }
    finally { setActionLoading(null); }
  }

  async function handleSetPreferredNode() {
    try {
      await rpc("republic.lmlink.routing.set", {
        preferredNodeId: selectedPreferredNode || null,
        strategy: selectedPreferredNode ? "auto" : "auto",
      });
      refetchRouting();
    } catch { /* error shown in UI state */ }
  }

  // ─── Tabs ────────────────────────────────────────────────

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "cluster", label: "LM Link Cluster" },
    { id: "models", label: "Models" },
    { id: "routing", label: "Routing" },
  ];

  // ─── Render ──────────────────────────────────────────────

  const isLinkEnabled = statusData?.cli?.lmLinkEnabled;
  const cliAvailable = statusData?.cli?.available ?? false;
  const linkedDevices = statusData?.cli?.linkedDevices ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="LM Studio"
        description="Local inference cluster — LM Link multi-node management & routing"
        icon={<Server size={28} />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => { refetchStatus(); refetchNodes(); refetchModels(); refetchRouting(); }}
              aria-label="Refresh all"
            >
              Refresh
            </Button>
            {cliAvailable && (
              <Button
                variant="ghost"
                size="sm"
                icon={<LogIn size={14} />}
                onClick={handleLogin}
                disabled={actionLoading === "login"}
                aria-label="Login to LM Studio"
              >
                {actionLoading === "login" ? "Opening…" : "Login"}
              </Button>
            )}
          </div>
        }
      />

      {/* Top stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Cluster Nodes"
          value={`${statusData?.onlineCount ?? 0} / ${statusData?.nodeCount ?? 0}`}
          icon={<Network size={16} />}
          sub="online / total"
        />
        <StatCard
          label="Local LMS"
          value={lmsHealth?.online ? "Online" : "Offline"}
          icon={<Server size={16} />}
          sub="localhost:1234"
        />
        <StatCard
          label="Total Models"
          value={statusData?.totalModels ?? 0}
          icon={<Package size={16} />}
          sub={`${statusData?.loadedModels ?? 0} loaded`}
        />
        <StatCard
          label="LM Link"
          value={isLinkEnabled === null ? "Unknown" : isLinkEnabled ? "Enabled" : "Disabled"}
          icon={<Radio size={16} />}
          sub={cliAvailable ? "CLI ready" : "No lms CLI"}
        />
      </div>

      {/* RTX 6000 Pro Banner */}
      {nodes.some((n) => n.isPowerNode && n.status === "online") && (
        <Card className="border-purple-500/40 bg-gradient-to-r from-purple-500/10 to-bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Zap size={20} className="text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-text-heading">Power Node Online</h3>
                <Badge variant="purple">RTX 6000 Pro 96 GB ⚡</Badge>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                {nodes.find((n) => n.isPowerNode)?.label} — Blackwell architecture, massive 96 GB VRAM for large-model inference
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-text-muted">Latency</p>
              <p className="font-mono text-sm text-purple-400">
                {nodes.find((n) => n.isPowerNode)?.latencyMs != null
                  ? `${nodes.find((n) => n.isPowerNode)?.latencyMs} ms`
                  : "—"}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Tab navigation */}
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ─── OVERVIEW TAB ─── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* LM Link CLI status */}
          {!cliAvailable && (
            <Alert variant="warning">
              <strong>lms CLI not found.</strong> Install LM Studio and add <code>lms</code> to your PATH for full LM Link control. Manual node registration still works.
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* LM Link control */}
            <Card className={`border-${isLinkEnabled ? "success" : "border"}/30`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-text-heading flex items-center gap-2">
                  <Radio size={16} className={isLinkEnabled ? "text-success" : "text-text-muted"} />
                  LM Link Status
                </h3>
                <Badge variant={isLinkEnabled ? "success" : isLinkEnabled === false ? "danger" : "neutral"}>
                  {isLinkEnabled === null ? "Unknown" : isLinkEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <p className="text-xs text-text-muted mb-4">
                LM Link connects your LM Studio instances via an end-to-end encrypted Tailscale mesh. Remote models appear as local.
              </p>
              <div className="flex gap-2 flex-wrap">
                {cliAvailable && (
                  <>
                    <Button
                      size="sm"
                      variant="success"
                      icon={<ToggleRight size={14} />}
                      onClick={handleEnableLink}
                      disabled={actionLoading === "enable"}
                    >
                      {actionLoading === "enable" ? "Enabling…" : "Enable Link"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<ToggleLeft size={14} />}
                      onClick={handleDisableLink}
                      disabled={actionLoading === "disable"}
                    >
                      {actionLoading === "disable" ? "Disabling…" : "Disable Link"}
                    </Button>
                  </>
                )}
              </div>

              {/* Linked devices from CLI */}
              {linkedDevices.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-text-muted mb-2">Linked devices:</p>
                  <div className="space-y-1">
                    {linkedDevices.map((dev, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-text-secondary">
                        <CheckCircle size={10} className="text-success flex-shrink-0" />
                        {dev}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Local LMS status */}
            <Card className={`border-${lmsHealth?.online ? "success" : "danger"}/30`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-text-heading flex items-center gap-2">
                  {lmsHealth?.online ? (
                    <Wifi size={16} className="text-success" />
                  ) : (
                    <WifiOff size={16} className="text-danger" />
                  )}
                  Local LM Studio
                </h3>
                <Badge variant={lmsHealth?.online ? "success" : "danger"}>
                  {lmsHealth?.online ? "Online" : "Offline"}
                </Badge>
              </div>
              <p className="text-xs text-text-muted mb-1">Endpoint: http://localhost:1234</p>
              {lmsHealth?.online && lmsHealth.loadedModel && (
                <p className="text-xs font-mono text-accent truncate mt-1">
                  Active: {lmsHealth.loadedModel}
                </p>
              )}
              {!lmsHealth?.online && (
                <p className="text-xs text-text-muted mt-2">
                  Start LM Studio desktop app and load a model.{" "}
                  <a
                    href="https://lmstudio.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    lmstudio.ai
                  </a>
                </p>
              )}
            </Card>
          </div>

          {/* Selected inference node */}
          {statusData?.selectedNode && (
            <Card className="border-accent/20">
              <div className="flex items-center gap-3">
                <Route size={16} className="text-accent" />
                <div>
                  <p className="text-xs text-text-muted">Active inference target</p>
                  <p className="font-semibold text-text-heading">{statusData.selectedNode.label}</p>
                </div>
                <Badge variant={gpuBadgeVariant(statusData.selectedNode.gpuProfile)} className="ml-auto">
                  {statusData.selectedNode.gpuProfile}
                </Badge>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ─── CLUSTER TAB ─── */}
      {activeTab === "cluster" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-muted">
              {(nodesData?.onlineCount ?? 0)} of {(nodesData?.totalCount ?? 0)} nodes online
            </p>
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw size={12} />}
              onClick={handleProbeAll}
              disabled={actionLoading === "probe"}
              aria-label="Probe all nodes"
            >
              {actionLoading === "probe" ? "Probing…" : "Probe All"}
            </Button>
          </div>

          {nodesLoading && <RpcStatus loading={nodesLoading} error={null} onRetry={refetchNodes} />}
          {nodesError && <RpcStatus loading={false} error={nodesError} onRetry={refetchNodes} />}

          {/* Node cards */}
          {!nodesLoading && !nodesError && (
            <div className="space-y-3">
              {nodes.length === 0 && (
                <EmptyState
                  icon={<Network size={32} />}
                  title="No nodes registered"
                  description="Add a remote LM Studio node below."
                />
              )}
              {nodes.map((node) => (
                <Card key={node.id} className={`border-${node.status === "online" ? "success" : "danger"}/20`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 p-1.5 rounded-lg ${node.isPowerNode ? "bg-purple-500/20" : "bg-bg-secondary"}`}>
                        {node.isPowerNode ? (
                          <Zap size={14} className="text-purple-400" />
                        ) : (
                          <Cpu size={14} className="text-text-muted" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-text-heading">{node.label}</span>
                          {node.isLocal && <Badge variant="info">Local</Badge>}
                          {node.isPowerNode && <Badge variant="purple">⚡ Power Node</Badge>}
                          <Badge variant={node.status === "online" ? "success" : node.status === "offline" ? "danger" : "neutral"}>
                            {node.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5 font-mono">
                          {node.host}:{node.port}
                          {node.dockerHostUrl && (
                            <span className="ml-3 text-info">Docker: {node.dockerHostUrl}</span>
                          )}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <Badge variant={gpuBadgeVariant(node.gpuProfile)}>
                            {node.gpuProfileLabel}
                          </Badge>
                          <span className="text-xs text-text-muted">
                            {node.loadedModelCount} loaded / {node.modelCount} available
                          </span>
                          {node.latencyMs != null && (
                            <span className="text-xs text-success font-mono">{node.latencyMs} ms</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {!node.isLocal && (
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<Trash2 size={12} />}
                        onClick={() => handleRemoveNode(node.id)}
                        disabled={actionLoading === `remove-${node.id}`}
                        aria-label={`Remove node ${node.label}`}
                      />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Add node form */}
          <AddNodeForm onAdded={() => { refetchNodes(); refetchStatus(); }} />

          {/* Setup instructions */}
          <Card className="border-info/20 bg-info/5">
            <h4 className="font-semibold text-info mb-2 flex items-center gap-2">
              <AlertCircle size={14} />
              LM Link Setup (Tailscale Mesh)
            </h4>
            <ol className="text-xs text-text-secondary space-y-1 list-decimal list-inside">
              <li>Install LM Studio on each machine (v0.4.6+)</li>
              <li>Run <code className="text-accent">lms login</code> on each machine (same account)</li>
              <li>Run <code className="text-accent">lms link enable</code> on the host/server machine</li>
              <li>For headless Linux/servers use <code className="text-accent">llmster</code> instead of LM Studio GUI</li>
              <li>Set <code className="text-accent">LMLINK_RTX6000_HOST</code> env var for auto-discovery of the Blackwell server</li>
            </ol>
          </Card>
        </div>
      )}

      {/* ─── MODELS TAB ─── */}
      {activeTab === "models" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-muted">
              {modelsData?.loadedCount ?? 0} loaded / {modelsData?.totalCount ?? 0} total across all nodes
            </p>
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw size={12} />}
              onClick={refetchModels}
              aria-label="Refresh models"
            >
              Refresh
            </Button>
          </div>

          {modelsLoading && <RpcStatus loading={modelsLoading} error={null} onRetry={refetchModels} />}
          {modelsError && <RpcStatus loading={false} error={modelsError} onRetry={refetchModels} />}

          {!modelsLoading && !modelsError && models.length === 0 && (
            <EmptyState
              icon={<Package size={32} />}
              title="No models found"
              description="All LM Link nodes appear to be offline, or no models are installed."
            />
          )}

          {!modelsLoading && !modelsError && models.length > 0 && (
            <div className="space-y-2">
              {models.map((model, i) => (
                <div
                  key={`${model.nodeId}-${model.key}-${i}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/20"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5">
                      {model.loaded ? (
                        <CheckCircle size={14} className="text-success" />
                      ) : (
                        <Layers size={14} className="text-text-muted" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-mono text-text-primary truncate">{model.displayName || model.key}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-text-muted">{model.nodeLabel}</span>
                        {model.loaded && <Badge variant="success">Loaded</Badge>}
                        {model.vision && <Badge variant="info">Vision</Badge>}
                        {model.toolUse && <Badge variant="purple">Tools</Badge>}
                        {model.quantization && (
                          <span className="text-xs text-text-muted font-mono">{model.quantization}</span>
                        )}
                        {model.sizeBytes > 0 && (
                          <span className="text-xs text-text-muted">{fmtBytes(model.sizeBytes)}</span>
                        )}
                        {model.contextLength > 0 && (
                          <span className="text-xs text-text-muted">{(model.contextLength / 1024).toFixed(0)}K ctx</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge variant={model.nodeStatus === "online" ? "success" : "neutral"} className="flex-shrink-0 ml-2">
                    {model.nodeStatus}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── ROUTING TAB ─── */}
      {activeTab === "routing" && (
        <div className="space-y-4">
          {routingLoading && <RpcStatus loading={routingLoading} error={null} onRetry={refetchRouting} />}
          {routingError && <RpcStatus loading={false} error={routingError} onRetry={refetchRouting} />}

          {!routingLoading && !routingError && (
            <>
              {/* Selected node */}
              <Card className="border-accent/30">
                <h3 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
                  <Route size={16} className="text-accent" />
                  Active Inference Target
                </h3>
                {routingData?.selectedNode ? (
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${routingData.selectedNode.isPowerNode ? "bg-purple-500/20" : "bg-bg-secondary"}`}>
                      {routingData.selectedNode.isPowerNode ? (
                        <Zap size={16} className="text-purple-400" />
                      ) : (
                        <Server size={16} className="text-accent" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-text-heading">{routingData.selectedNode.label}</p>
                      <p className="text-xs text-text-muted font-mono">
                        {routingData.selectedNode.host}:{routingData.selectedNode.port}
                        {routingData.selectedNode.latencyMs != null && ` · ${routingData.selectedNode.latencyMs} ms`}
                      </p>
                    </div>
                    <Badge variant={gpuBadgeVariant(routingData.selectedNode.gpuProfile)} className="ml-auto">
                      {routingData.selectedNode.gpuProfile}
                    </Badge>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">No online nodes available for routing.</p>
                )}
              </Card>

              {/* Routing config */}
              <Card>
                <h3 className="font-semibold text-text-heading mb-4">Routing Configuration</h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Preferred Node (auto-selects if online)</label>
                    <div className="flex items-center gap-2">
                      <select
                        id="routing-preferred-node"
                        className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                        value={selectedPreferredNode}
                        onChange={(e) => setSelectedPreferredNode(e.target.value)}
                      >
                        <option value="">Auto (lowest latency)</option>
                        {onlineNodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.label}{n.isPowerNode ? " ⚡" : ""} {n.latencyMs != null ? `· ${n.latencyMs}ms` : ""}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSetPreferredNode}
                      >
                        Apply
                      </Button>
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      Current: {routingCfg?.preferredNodeId
                        ? onlineNodes.find((n) => n.id === routingCfg.preferredNodeId)?.label ?? routingCfg.preferredNodeId
                        : "Auto"}
                    </p>
                  </div>

                  <div className="text-xs text-text-muted rounded-lg bg-bg-secondary p-3 space-y-1">
                    <p><strong className="text-text-secondary">Strategy:</strong> {routingCfg?.strategy ?? "auto"}</p>
                    <p><strong className="text-text-secondary">Fallback to local:</strong> {routingCfg?.fallbackToLocal ? "Yes" : "No"}</p>
                  </div>
                </div>
              </Card>

              {/* Online node table */}
              {onlineNodes.length > 0 && (
                <Card>
                  <h3 className="font-semibold text-text-heading mb-3">Online Nodes</h3>
                  <div className="space-y-2">
                    {onlineNodes.map((n) => (
                      <div key={n.id} className="flex items-center justify-between p-2 rounded bg-bg-secondary border border-border/20">
                        <div className="flex items-center gap-2">
                          {n.isPowerNode && <Zap size={12} className="text-purple-400" />}
                          <span className="text-sm text-text-primary">{n.label}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-muted">
                          <span>{n.loadedModelCount} loaded</span>
                          {n.latencyMs != null && (
                            <span className="font-mono text-success">{n.latencyMs} ms</span>
                          )}
                          {routingCfg?.preferredNodeId === n.id && (
                            <Badge variant="info">Preferred</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
