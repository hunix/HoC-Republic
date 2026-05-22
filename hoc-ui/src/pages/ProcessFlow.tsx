import {
  Activity,
  ArrowRight,
  Box,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Layers,
  Monitor,
  Network,
  Radio,
  RefreshCw,
  Server,
  Settings,
  Users,
  Wifi,
  WifiOff,
  Zap,
  GitBranch,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  Package,
} from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  StatCard,
  Tabs,
  RpcStatus,
  EmptyState,
} from "@/components/ui";
import { useRpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface SimStatus {
  running: boolean;
  tickCount: number;
  population: number;
  averageEnergy: number;
  activeAgents: number;
}

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  status: "active" | "inactive" | "error" | "loading";
  priority: number;
  category?: string;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
}

// ─── Flow Node Component ────────────────────────────────────────

interface FlowNodeProps {
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  status?: "online" | "offline" | "warning" | "idle" | "active";
  children?: React.ReactNode;
  highlight?: boolean;
  pulse?: boolean;
  className?: string;
}

function FlowNode({ label, sublabel, icon, status = "idle", children, highlight, pulse, className = "" }: FlowNodeProps) {
  const statusColors = {
    online: "border-success/50 bg-success/5",
    offline: "border-danger/50 bg-danger/5",
    warning: "border-warning/50 bg-warning/5",
    idle: "border-border/40 bg-bg-card",
    active: "border-accent/50 bg-accent/5",
  };

  const dotColors = {
    online: "bg-success",
    offline: "bg-danger",
    warning: "bg-warning",
    idle: "bg-text-muted",
    active: "bg-accent",
  };

  return (
    <div className={`relative rounded-xl border-2 p-4 transition-all duration-300 ${statusColors[status]} ${highlight ? "ring-2 ring-accent/30 shadow-lg shadow-accent/10" : ""} ${className}`}>
      {pulse && status === "active" && (
        <div className="absolute -top-1 -right-1">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${dotColors[status]}`} />
          </span>
        </div>
      )}
      {!pulse && (
        <div className="absolute -top-1 -right-1">
          <span className={`inline-flex rounded-full h-3 w-3 ${dotColors[status]}`} />
        </div>
      )}
      <div className="flex items-center gap-2 mb-1">
        <div className="text-accent">{icon}</div>
        <div>
          <p className="font-semibold text-sm text-text-heading">{label}</p>
          {sublabel && <p className="text-xs text-text-muted">{sublabel}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Connection Arrow ───────────────────────────────────────────

function FlowArrow({ direction = "right", label, animated }: { direction?: "right" | "down"; label?: string; animated?: boolean }) {
  if (direction === "down") {
    return (
      <div className="flex flex-col items-center py-1">
        <div className={`w-0.5 h-6 ${animated ? "bg-gradient-to-b from-accent/60 to-accent/20 animate-pulse" : "bg-border/40"}`} />
        {label && <span className="text-[10px] text-text-muted my-0.5">{label}</span>}
        <svg width="12" height="8" className="text-accent/60"><polygon points="6,8 0,0 12,0" fill="currentColor" /></svg>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 px-1">
      <div className={`h-0.5 w-6 ${animated ? "bg-gradient-to-r from-accent/60 to-accent/20 animate-pulse" : "bg-border/40"}`} />
      {label && <span className="text-[10px] text-text-muted">{label}</span>}
      <ArrowRight size={12} className="text-accent/60" />
    </div>
  );
}

// ─── Execution Pipeline Row ─────────────────────────────────────

interface PipelineStage {
  label: string;
  icon: React.ReactNode;
  status: "completed" | "active" | "pending" | "error";
  detail?: string;
}

function ExecutionPipeline({ title, stages }: { title: string; stages: PipelineStage[] }) {
  const statusStyle = {
    completed: "border-success/40 bg-success/10 text-success",
    active: "border-accent/40 bg-accent/10 text-accent animate-pulse",
    pending: "border-border/30 bg-bg-secondary text-text-muted",
    error: "border-danger/40 bg-danger/10 text-danger",
  };
  const statusIcon = {
    completed: <CheckCircle size={12} />,
    active: <Play size={12} />,
    pending: <Clock size={12} />,
    error: <AlertCircle size={12} />,
  };

  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{title}</h4>
      <div className="flex items-center gap-1 flex-wrap">
        {stages.map((stage, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${statusStyle[stage.status]}`}>
              {statusIcon[stage.status]}
              {stage.icon}
              <span>{stage.label}</span>
              {stage.detail && <span className="text-[10px] opacity-70">({stage.detail})</span>}
            </div>
            {i < stages.length - 1 && <ArrowRight size={10} className="text-text-muted mx-0.5" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export function ProcessFlowPage() {
  const [activeTab, setActiveTab] = useState("topology");

  const { data: simData, loading: simLoading, error: simError, refetch: refetchSim } =
    useRpc<SimStatus>("republic.simulation.status", {}, [], { staleTimeMs: 3000, refetchIntervalMs: 5000 });

  const { data: pluginsData } =
    useRpc<{ plugins: PluginInfo[] }>("republic.plugins.list", {}, [], { staleTimeMs: 10000, refetchIntervalMs: 30000 });

  const { data: computeData } =
    useRpc<{
      ollama: { running: boolean; models: Array<{ name: string; size?: string }> };
      lmstudio: { running: boolean; models: string[] };
    }>("republic.compute.local.status", {}, [], { staleTimeMs: 5000, refetchIntervalMs: 15000 });

  const { data: dockerData } =
    useRpc<{ diagnostics: { allContainers?: DockerContainer[] } }>("republic.docker.status", {}, [], {
      staleTimeMs: 10000,
      refetchIntervalMs: 30000,
    });

  const { data: healthData } =
    useRpc<{ ok: boolean; uptime: number; version: string }>("health.check", {}, [], {
      staleTimeMs: 5000,
      refetchIntervalMs: 10000,
    });

  if (simLoading || simError) {
    return <RpcStatus loading={simLoading} error={simError} onRetry={refetchSim} />;
  }

  const plugins = pluginsData?.plugins ?? [];
  const activePlugins = plugins.filter((p) => p.status === "active");
  const ollamaRunning = computeData?.ollama?.running ?? false;
  const lmstudioRunning = computeData?.lmstudio?.running ?? false;
  const containers = dockerData?.diagnostics?.allContainers ?? [];
  const runningContainers = containers.filter((c) => c.state === "running");
  const simRunning = simData?.running ?? false;

  const TABS = [
    { id: "topology", label: "System Topology" },
    { id: "pipelines", label: "Execution Pipelines" },
    { id: "plugins", label: "Plugin Ecosystem" },
    { id: "compute", label: "Compute Cluster" },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Process Flow"
        description="Live system topology, execution pipelines, and infrastructure map"
        icon={<GitBranch size={28} />}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={simRunning ? "success" : "warning"}>
              {simRunning ? "Republic Active" : "Republic Paused"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={refetchSim}
              aria-label="Refresh"
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Top stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard
          label="Tick Count"
          value={simData?.tickCount ?? 0}
          icon={<Activity size={16} />}
          sub={simRunning ? "running" : "paused"}
        />
        <StatCard
          label="Citizens"
          value={simData?.population ?? 0}
          icon={<Users size={16} />}
          sub={`${simData?.activeAgents ?? 0} active`}
        />
        <StatCard
          label="Active Plugins"
          value={activePlugins.length}
          icon={<Package size={16} />}
          sub={`${plugins.length} total`}
        />
        <StatCard
          label="LLM Nodes"
          value={[ollamaRunning, lmstudioRunning].filter(Boolean).length}
          icon={<Cpu size={16} />}
          sub="inference engines"
        />
        <StatCard
          label="Containers"
          value={runningContainers.length}
          icon={<Box size={16} />}
          sub={`${containers.length} total`}
        />
      </div>

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ─── TOPOLOGY TAB ─── */}
      {activeTab === "topology" && (
        <div className="space-y-6">
          {/* Main Architecture Flow */}
          <Card className="overflow-x-auto">
            <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
              <Network size={16} className="text-accent" />
              System Architecture
            </h3>

            {/* Layer 1: Client → Gateway */}
            <div className="flex items-start gap-3 mb-6 flex-wrap">
              <FlowNode label="React UI" sublabel="hoc-ui" icon={<Monitor size={16} />} status="online" pulse>
                <p className="text-[10px] text-text-muted mt-1">Vite + Tailwind</p>
              </FlowNode>

              <FlowArrow animated label="WebSocket/RPC" />

              <FlowNode label="Gateway" sublabel={`v${healthData?.version ?? "?"}`} icon={<Server size={16} />} status="online" highlight pulse>
                <div className="mt-1 space-y-0.5">
                  <p className="text-[10px] text-text-muted">Node.js + TypeScript</p>
                  <p className="text-[10px] text-text-muted">Uptime: {healthData?.uptime ? `${Math.floor(healthData.uptime / 60)}m` : "—"}</p>
                </div>
              </FlowNode>

              <FlowArrow animated label="dispatch" />

              <FlowNode label="Republic Engine" sublabel="Tick Orchestrator" icon={<Zap size={16} />} status={simRunning ? "active" : "idle"} pulse={simRunning}>
                <div className="mt-1 space-y-0.5">
                  <p className="text-[10px] text-text-muted">Tick #{simData?.tickCount ?? 0}</p>
                  <p className="text-[10px] text-text-muted">{simData?.population ?? 0} citizens</p>
                </div>
              </FlowNode>
            </div>

            {/* Layer 2: Republic subsystems */}
            <div className="ml-4 pl-4 border-l-2 border-accent/20 space-y-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Republic Subsystems</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <FlowNode label="Citizen Lifecycle" icon={<Users size={14} />} status={simRunning ? "active" : "idle"} className="!p-3">
                  <p className="text-[10px] text-text-muted">biology · energy · aging</p>
                </FlowNode>
                <FlowNode label="Cognitive Loop" icon={<Activity size={14} />} status={simRunning ? "active" : "idle"} className="!p-3">
                  <p className="text-[10px] text-text-muted">curiosity · reflection</p>
                </FlowNode>
                <FlowNode label="Economy" icon={<Database size={14} />} status={simRunning ? "active" : "idle"} className="!p-3">
                  <p className="text-[10px] text-text-muted">ledger · credits · market</p>
                </FlowNode>
                <FlowNode label="Governance" icon={<Globe size={14} />} status={simRunning ? "active" : "idle"} className="!p-3">
                  <p className="text-[10px] text-text-muted">laws · voting · justice</p>
                </FlowNode>
                <FlowNode label="SoulSync" icon={<Radio size={14} />} status={simRunning ? "active" : "idle"} className="!p-3">
                  <p className="text-[10px] text-text-muted">devotion · alignment</p>
                </FlowNode>
              </div>
            </div>

            {/* Layer 3: Infrastructure */}
            <div className="mt-6 pt-4 border-t border-border/20">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Infrastructure Layer</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FlowNode
                  label="Ollama"
                  sublabel="localhost:11434"
                  icon={ollamaRunning ? <Wifi size={14} /> : <WifiOff size={14} />}
                  status={ollamaRunning ? "online" : "offline"}
                  className="!p-3"
                >
                  <p className="text-[10px] text-text-muted">{(computeData?.ollama?.models ?? []).length} models</p>
                </FlowNode>
                <FlowNode
                  label="LM Studio"
                  sublabel="localhost:1234"
                  icon={lmstudioRunning ? <Wifi size={14} /> : <WifiOff size={14} />}
                  status={lmstudioRunning ? "online" : "offline"}
                  className="!p-3"
                >
                  <p className="text-[10px] text-text-muted">{(computeData?.lmstudio?.models ?? []).length} models</p>
                </FlowNode>

                <FlowNode
                  label="Docker"
                  sublabel="containers"
                  icon={<Box size={14} />}
                  status={runningContainers.length > 0 ? "online" : "idle"}
                  className="!p-3"
                >
                  <p className="text-[10px] text-text-muted">{runningContainers.length} running</p>
                </FlowNode>
              </div>
            </div>
          </Card>

          {/* Data Flow Diagram */}
          <Card>
            <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
              <Layers size={16} className="text-accent" />
              RPC Data Flow
            </h3>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {[
                { label: "UI Component", icon: <Monitor size={12} />, color: "text-info" },
                { label: "useRpc()", icon: <ArrowRight size={10} />, color: "text-accent" },
                { label: "WebSocket", icon: <Radio size={12} />, color: "text-purple" },
                { label: "server-methods.ts", icon: <ArrowRight size={10} />, color: "text-accent" },
                { label: "Domain Handler", icon: <Settings size={12} />, color: "text-success" },
                { label: "Republic Engine", icon: <ArrowRight size={10} />, color: "text-accent" },
                { label: "Response", icon: <CheckCircle size={12} />, color: "text-success" },
              ].map((step, i) => (
                <div key={i} className={`flex items-center gap-1 px-2 py-1 rounded bg-bg-secondary border border-border/20 ${step.color}`}>
                  {step.icon}
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── PIPELINES TAB ─── */}
      {activeTab === "pipelines" && (
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
              <Activity size={16} className="text-accent" />
              Live Execution Pipelines
            </h3>

            <ExecutionPipeline
              title="Citizen Tick Cycle"
              stages={[
                { label: "Energy Decay", icon: <Zap size={10} />, status: simRunning ? "completed" : "pending", detail: "biology" },
                { label: "Task Selection", icon: <Settings size={10} />, status: simRunning ? "completed" : "pending", detail: "agent-runtime" },
                { label: "LLM Inference", icon: <Cpu size={10} />, status: simRunning ? "active" : "pending", detail: "cloud-inference" },
                { label: "Tool Execution", icon: <Play size={10} />, status: simRunning ? "active" : "pending", detail: "real-execution" },
                { label: "Memory Update", icon: <Database size={10} />, status: simRunning ? "pending" : "pending", detail: "memory" },
                { label: "Event Emit", icon: <Radio size={10} />, status: simRunning ? "pending" : "pending", detail: "intel-bus" },
              ]}
            />

            <ExecutionPipeline
              title="LLM Inference Pipeline"
              stages={[
                { label: "Request", icon: <ArrowRight size={10} />, status: ollamaRunning || lmstudioRunning ? "completed" : "error" },
                { label: "Router", icon: <GitBranch size={10} />, status: ollamaRunning || lmstudioRunning ? "completed" : "pending", detail: "inference-gateway" },
                { label: "Local Pool", icon: <HardDrive size={10} />, status: ollamaRunning ? "active" : "pending", detail: "model-pool" },
                { label: "Ollama", icon: <Server size={10} />, status: ollamaRunning ? "completed" : "pending" },
                { label: "LM Studio", icon: <Server size={10} />, status: lmstudioRunning ? "completed" : "pending" },
                { label: "Response", icon: <CheckCircle size={10} />, status: ollamaRunning || lmstudioRunning ? "completed" : "error" },
              ]}
            />

            <ExecutionPipeline
              title="Production Pipeline"
              stages={[
                { label: "Creative Brief", icon: <Settings size={10} />, status: simRunning ? "completed" : "pending" },
                { label: "Asset Generation", icon: <Layers size={10} />, status: simRunning ? "active" : "pending", detail: "plugins" },
                { label: "Quality Check", icon: <CheckCircle size={10} />, status: "pending" },
                { label: "Store Listing", icon: <Package size={10} />, status: "pending", detail: "AI store" },
                { label: "Distribution", icon: <Globe size={10} />, status: "pending" },
              ]}
            />

            <ExecutionPipeline
              title="Workflow Orchestration"
              stages={[
                { label: "Decompose", icon: <GitBranch size={10} />, status: "completed", detail: "templates" },
                { label: "Assign Citizens", icon: <Users size={10} />, status: "completed" },
                { label: "Phase Execution", icon: <Play size={10} />, status: simRunning ? "active" : "pending", detail: "DAG" },
                { label: "Dependencies", icon: <Network size={10} />, status: "pending", detail: "phase deps" },
                { label: "Completion", icon: <CheckCircle size={10} />, status: "pending" },
              ]}
            />

            <ExecutionPipeline
              title="Plugin Lifecycle"
              stages={[
                { label: "Discovery", icon: <Package size={10} />, status: "completed", detail: "plugins/" },
                { label: "Boot Priority", icon: <Layers size={10} />, status: "completed" },
                { label: "Docker Spawn", icon: <Box size={10} />, status: runningContainers.length > 0 ? "active" : "pending" },
                { label: "Health Check", icon: <Activity size={10} />, status: runningContainers.length > 0 ? "completed" : "pending" },
                { label: "RPC Bridge", icon: <Radio size={10} />, status: "completed", detail: "gateway" },
              ]}
            />
          </Card>

          {/* Tick Orchestrator DAG */}
          <Card>
            <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
              <GitBranch size={16} className="text-accent" />
              Tick Orchestrator — DAG Execution Order
            </h3>
            <div className="space-y-2">
              {[
                { phase: "Phase 0", modules: ["hardware-survey", "resource-governor"], status: simRunning ? "active" as const : "idle" as const },
                { phase: "Phase 1", modules: ["citizen-biology", "energy-decay", "aging"], status: simRunning ? "active" as const : "idle" as const },
                { phase: "Phase 2", modules: ["citizen-devotion (SoulSync)", "social-fabric"], status: simRunning ? "active" as const : "idle" as const },
                { phase: "Phase 3", modules: ["cognitive-loop", "curiosity-engine", "education"], status: simRunning ? "active" as const : "idle" as const },
                { phase: "Phase 4", modules: ["agent-runtime", "task-selection", "LLM-inference"], status: simRunning ? "active" as const : "idle" as const },
                { phase: "Phase 5", modules: ["tool-execution", "production", "creative"], status: simRunning ? "active" as const : "idle" as const },
                { phase: "Phase 6", modules: ["economy-ledger", "marketplace", "governance"], status: simRunning ? "active" as const : "idle" as const },
                { phase: "Phase 7", modules: ["reproduction", "evolution", "genetics"], status: simRunning ? "active" as const : "idle" as const },
                { phase: "Phase 8", modules: ["intel-bus-publish", "event-sourcing", "persistence"], status: simRunning ? "active" as const : "idle" as const },
              ].map((phase, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Badge variant={phase.status === "active" ? "success" : "neutral"} className="w-20 justify-center text-[10px]">
                    {phase.phase}
                  </Badge>
                  <div className="flex gap-1.5 flex-wrap flex-1">
                    {phase.modules.map((mod) => (
                      <span key={mod} className={`px-2 py-0.5 rounded text-[10px] font-mono border ${phase.status === "active" ? "border-success/30 bg-success/10 text-success" : "border-border/30 bg-bg-secondary text-text-muted"}`}>
                        {mod}
                      </span>
                    ))}
                  </div>
                  {i < 8 && <ArrowRight size={10} className="text-text-muted flex-shrink-0" />}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── PLUGINS TAB ─── */}
      {activeTab === "plugins" && (
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
              <Package size={16} className="text-accent" />
              Plugin Ecosystem ({plugins.length} plugins)
            </h3>

            {plugins.length === 0 && (
              <EmptyState icon={<Package size={32} />} title="No plugins loaded" description="Plugins will appear here once the gateway boots." />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {plugins.map((plugin) => {
                const catColors: Record<string, string> = {
                  "ai-agents": "border-purple-500/30 bg-purple-500/5",
                  video: "border-info/30 bg-info/5",
                  image: "border-success/30 bg-success/5",
                  audio: "border-warning/30 bg-warning/5",
                  devtools: "border-accent/30 bg-accent/5",
                  infrastructure: "border-danger/30 bg-danger/5",
                  science: "border-info/30 bg-info/5",
                  economy: "border-success/30 bg-success/5",
                };
                const cat = plugin.category ?? "other";
                const cardClass = catColors[cat] ?? "border-border/30 bg-bg-secondary";

                return (
                  <div key={plugin.id} className={`p-3 rounded-lg border ${cardClass}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-text-heading truncate">{plugin.name}</span>
                      <Badge variant={plugin.status === "active" ? "success" : plugin.status === "error" ? "danger" : "neutral"}>
                        {plugin.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-text-muted">
                      <span>v{plugin.version}</span>
                      <span>•</span>
                      <span>priority {plugin.priority}</span>
                      {cat !== "other" && (
                        <>
                          <span>•</span>
                          <span className="capitalize">{cat}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Plugin → Gateway data flow */}
          <Card>
            <h3 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
              <Layers size={16} className="text-accent" />
              Plugin Integration Flow
            </h3>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {[
                { label: "plugins/hoc-plugin-*", color: "text-purple" },
                { label: "→ hot-load" },
                { label: "Boot Priority Queue", color: "text-warning" },
                { label: "→ init" },
                { label: "Docker Container", color: "text-info" },
                { label: "→ RPC bridge" },
                { label: "Gateway Handler", color: "text-success" },
                { label: "→ UI page" },
                { label: "React Component", color: "text-accent" },
              ].map((step, i) => (
                <span key={i} className={`px-2 py-1 rounded bg-bg-secondary border border-border/20 ${step.color ?? "text-text-muted"}`}>
                  {step.label}
                </span>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── COMPUTE TAB ─── */}
      {activeTab === "compute" && (
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
              <Cpu size={16} className="text-accent" />
              Compute Cluster Topology
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Ollama */}
              <FlowNode
                label="Ollama"
                sublabel="127.0.0.1:11434"
                icon={<Server size={16} />}
                status={ollamaRunning ? "online" : "offline"}
                pulse={ollamaRunning}
              >
                <div className="mt-2 space-y-1">
                  {(computeData?.ollama?.models ?? []).length === 0 && (
                    <p className="text-[10px] text-text-muted italic">No models loaded</p>
                  )}
                  {(computeData?.ollama?.models ?? []).map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-text-secondary truncate">{m.name}</span>
                      {m.size && <span className="text-text-muted ml-1">{m.size}</span>}
                    </div>
                  ))}
                </div>
              </FlowNode>

              {/* LM Studio */}
              <FlowNode
                label="LM Studio"
                sublabel="127.0.0.1:1234"
                icon={<Server size={16} />}
                status={lmstudioRunning ? "online" : "offline"}
                pulse={lmstudioRunning}
              >
                <div className="mt-2 space-y-1">
                  {(computeData?.lmstudio?.models ?? []).length === 0 && (
                    <p className="text-[10px] text-text-muted italic">No models loaded</p>
                  )}
                  {(computeData?.lmstudio?.models ?? []).map((m, i) => (
                    <div key={i} className="text-[10px] font-mono text-text-secondary truncate">{m}</div>
                  ))}
                </div>
              </FlowNode>

            </div>
          </Card>

          {/* Docker Containers */}
          <Card>
            <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
              <Box size={16} className="text-accent" />
              Docker Containers ({containers.length})
            </h3>

            {containers.length === 0 && (
              <EmptyState icon={<Box size={32} />} title="No containers" description="Docker containers will appear here." />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {containers.map((c) => (
                <div key={c.id} className={`p-3 rounded-lg border ${c.state === "running" ? "border-success/30 bg-success/5" : "border-border/30 bg-bg-secondary"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm text-text-heading truncate">{c.name}</span>
                    <Badge variant={c.state === "running" ? "success" : "neutral"}>{c.state}</Badge>
                  </div>
                  <p className="text-[10px] text-text-muted truncate">{c.image}</p>
                  <p className="text-[10px] text-text-muted">{c.status}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Inference Flow */}
          <Card>
            <h3 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
              <GitBranch size={16} className="text-accent" />
              Inference Request Flow
            </h3>
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-1">
                <FlowNode label="Citizen Agent" sublabel="task prompt" icon={<Users size={14} />} status="active" className="!p-3 w-full max-w-xs" />
                <FlowArrow direction="down" animated label="inference request" />
                <FlowNode label="Inference Gateway" sublabel="cloud-inference.ts" icon={<GitBranch size={14} />} status="active" className="!p-3 w-full max-w-xs" />
                <FlowArrow direction="down" animated label="route to best provider" />
                <div className="flex gap-3 flex-wrap justify-center">
                  <FlowNode label="Ollama" icon={<Server size={12} />} status={ollamaRunning ? "online" : "offline"} className="!p-2 text-xs" />
                  <FlowNode label="LM Studio" icon={<Server size={12} />} status={lmstudioRunning ? "online" : "offline"} className="!p-2 text-xs" />

                </div>
                <FlowArrow direction="down" animated label="response + telemetry" />
                <FlowNode label="Response Processor" sublabel="validation · memory · event" icon={<CheckCircle size={14} />} status="active" className="!p-3 w-full max-w-xs" />
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
