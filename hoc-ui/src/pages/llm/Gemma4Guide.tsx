import { useState } from "react";
import {
  Sparkles,
  Brain,
  Cpu,
  Server,
  Cloud,
  Zap,
  CheckCircle2,
  Circle,
  ArrowRight,
  Monitor,
  HardDrive,
  ChevronDown,
  ChevronRight,
  RefreshCcw,
  Download,
  BookOpen,
  Layers,
  GitBranch,
  Shield,
  Eye,
  Wrench,
  Terminal,
} from "lucide-react";
import { useRpc } from "@/lib/rpc";
import {
  Button,
  Card,
  Badge,
  StatCard,
  PageHeader,
  Tabs,
  RpcStatus,
  Alert,
  ProgressBar,
} from "@/components/ui";

/* ─── Types ────────────────────────────────────────────────── */

interface CloudProviders {
  gemma4: boolean;
  lmStudio: boolean;
  ollama: boolean;
  gemini: boolean;
  groq: boolean;
  nvidiaNim: boolean;
  deepseek: boolean;
  openrouter: boolean;
  [key: string]: boolean;
}

/* ─── Deployment Steps ─────────────────────────────────────── */

interface DeployStep {
  id: string;
  title: string;
  description: string;
  commands?: string[];
  notes?: string;
  icon: React.ReactNode;
}

const LM_STUDIO_STEPS: DeployStep[] = [
  {
    id: "download-lmstudio",
    title: "Install LM Studio",
    description: "Download and install LM Studio from lmstudio.ai. It provides a GUI for downloading and running models locally with OpenAI-compatible API.",
    notes: "Supports Windows, macOS, and Linux. GPU acceleration with CUDA/Metal.",
    icon: <Download size={16} />,
  },
  {
    id: "download-model",
    title: "Download Gemma 4 Model",
    description: "In LM Studio, search for 'gemma-4' and download the appropriate variant for your GPU.",
    notes: "26B MoE (Q4) needs ~18GB VRAM. E4B (Q4) needs ~5GB. E2B (Q4) needs ~3GB.",
    icon: <HardDrive size={16} />,
  },
  {
    id: "load-model",
    title: "Load and Configure Model",
    description: "Load the downloaded model. Set Context Length to 4096+ and enable 100% GPU offload. Set KV cache to q8_0 for VRAM savings.",
    commands: [
      "Context Length: 4096 (or higher for complex tasks)",
      "GPU Offload: 100%",
      "KV Cache Type: q8_0",
      "Max Concurrent: 4-8 (depending on VRAM)",
    ],
    icon: <Cpu size={16} />,
  },
  {
    id: "start-server",
    title: "Start Local Server",
    description: "Enable the local server in LM Studio. It exposes an OpenAI-compatible API at the configured port.",
    notes: "Default port: 1234. The HoC gateway connects via LMSTUDIO_HOST and LMSTUDIO_PORT env vars.",
    icon: <Server size={16} />,
  },
  {
    id: "configure-env",
    title: "Configure HoC Gateway",
    description: "Add the Gemma 4 configuration to your .env file to activate sovereign inference.",
    commands: [
      "GEMMA4_ENABLED=true",
      "GEMMA4_MODEL=gemma4:26b-a4b",
      "LMSTUDIO_HOST=localhost",
      "LMSTUDIO_PORT=1234",
    ],
    icon: <Wrench size={16} />,
  },
  {
    id: "rebuild",
    title: "Rebuild & Restart Gateway",
    description: "Rebuild the gateway to register the new Gemma 4 inference path.",
    commands: ["pnpm build", "pnpm dev"],
    icon: <Terminal size={16} />,
  },
];

const DOCKER_STEPS: DeployStep[] = [
  {
    id: "docker-compose",
    title: "Add Gemma 4 Container",
    description: "Create a Docker container with LM Studio or vLLM that runs Gemma 4 with GPU passthrough.",
    commands: [
      "docker run -d --gpus all \\",
      "  -p 1234:1234 \\",
      "  -v ./models:/models \\",
      "  --name hoc-gemma4 \\",
      "  lmstudio/lmstudio-server:latest",
    ],
    notes: "Ensure NVIDIA Container Toolkit is installed for GPU passthrough.",
    icon: <Layers size={16} />,
  },
  {
    id: "docker-lmlink",
    title: "Register as LM Link Node",
    description: "Register the Docker container as an LM Link node so the orchestrator can discover and route inference to it automatically.",
    notes: "Go to Nodes → LM Link and add the container's host:port.",
    icon: <GitBranch size={16} />,
  },
];

const CLOUD_STEPS: DeployStep[] = [
  {
    id: "gemini-key",
    title: "Get Free Gemini API Key",
    description: "Get a free API key from Google AI Studio. Gemma 4 models are available via the Gemini API at no cost for standard usage.",
    notes: "Free tier: 15 RPM, 1M tokens/day. Sufficient for citizen inference fallback.",
    icon: <Cloud size={16} />,
  },
  {
    id: "gemini-env",
    title: "Add API Key to .env",
    description: "Configure the Gemini API key and optionally set the cloud Gemma model.",
    commands: [
      "GEMINI_API_KEY=your_key_here",
      "GEMMA4_CLOUD_MODEL=gemma-4-27b-it",
    ],
    icon: <Wrench size={16} />,
  },
];

/* ─── Model Variants ───────────────────────────────────────── */

interface ModelVariant {
  id: string;
  name: string;
  params: string;
  activeParams: string;
  vram: string;
  context: string;
  bestFor: string;
  quality: number;
  speed: number;
  tier: string;
  gpu: string;
}

const MODELS: ModelVariant[] = [
  {
    id: "gemma4:31b",
    name: "Gemma 4 31B Dense",
    params: "30.7B",
    activeParams: "30.7B (all)",
    vram: "~20 GB (Q4)",
    context: "256K",
    bestFor: "Orchestrator decisions, deep reasoning, high-stakes tasks",
    quality: 0.94,
    speed: 0.55,
    tier: "Standard",
    gpu: "RTX 6000 Pro Blackwell",
  },
  {
    id: "gemma4:26b-a4b",
    name: "Gemma 4 26B MoE",
    params: "26.4B",
    activeParams: "3.8B (MoE)",
    vram: "~18 GB (Q4)",
    context: "256K",
    bestFor: "Elite citizen brain, function calling, thinking mode",
    quality: 0.92,
    speed: 0.78,
    tier: "Local",
    gpu: "TITAN RTX / RTX 3090 Ti",
  },
  {
    id: "gemma4:e4b",
    name: "Gemma 4 E4B",
    params: "~8B",
    activeParams: "4.5B (PLE)",
    vram: "~5 GB (Q4)",
    context: "128K",
    bestFor: "Skilled citizens, lightweight inference, co-located with 26B",
    quality: 0.80,
    speed: 0.90,
    tier: "Local",
    gpu: "Any GPU with 6GB+",
  },
  {
    id: "gemma4:e2b",
    name: "Gemma 4 E2B (Edge)",
    params: "~5B",
    activeParams: "2.3B (PLE)",
    vram: "~3 GB (Q4)",
    context: "128K",
    bestFor: "Basic workers, multimodal (image+video+audio), ultra-fast",
    quality: 0.65,
    speed: 0.95,
    tier: "Edge",
    gpu: "Any GPU with 4GB+",
  },
];

/* ─── Page Component ───────────────────────────────────────── */

export function Gemma4GuidePage() {
  const [tab, setTab] = useState("overview");
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const {
    data: providerStatus,
    loading,
    error,
    refetch,
  } = useRpc<CloudProviders>("health.providers", {});

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const gemma4Active = providerStatus?.gemma4 ?? false;
  const lmStudioActive = providerStatus?.lmStudio ?? false;
  const geminiActive = providerStatus?.gemini ?? false;

  const tabs = [
    { id: "overview", label: "Overview", icon: <Sparkles size={14} /> },
    { id: "models", label: "Model Variants", icon: <Brain size={14} /> },
    { id: "deploy-local", label: "Deploy Local", icon: <Monitor size={14} /> },
    { id: "deploy-docker", label: "Deploy Docker", icon: <Layers size={14} /> },
    { id: "deploy-cloud", label: "Cloud Free", icon: <Cloud size={14} /> },
    { id: "architecture", label: "Architecture", icon: <GitBranch size={14} /> },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Gemma 4 Sovereignty"
        description="Deploy sovereign, local intelligence — replace cloud dependency with Apache 2.0 Gemma 4"
        icon={<Sparkles size={28} />}
        actions={
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCcw size={14} className="mr-1" /> Refresh Status
          </Button>
        }
      />

      {/* ── Live Status Indicators ──────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Gemma 4 Engine"
          value={gemma4Active ? "Active" : "Inactive"}
          icon={<Brain size={18} />}
          sub={gemma4Active ? "Sovereign inference online" : "Enable in .env"}
        />
        <StatCard
          label="LM Studio"
          value={lmStudioActive ? "Connected" : "Offline"}
          icon={<Monitor size={18} />}
          sub={lmStudioActive ? "Local GPU inference ready" : "Start LM Studio server"}
        />
        <StatCard
          label="Cloud Fallback"
          value={geminiActive ? "Available" : "Not Configured"}
          icon={<Cloud size={18} />}
          sub={geminiActive ? "Gemini API free tier" : "Add GEMINI_API_KEY"}
        />
        <StatCard
          label="Sovereignty"
          value={gemma4Active ? "100%" : lmStudioActive ? "Partial" : "0%"}
          icon={<Shield size={18} />}
          sub="Local inference ratio"
        />
      </div>

      {/* ── Quick Start Alert ───────────────────────────────── */}
      {!gemma4Active && (
        <Alert variant="info">
          <strong>Quick Start:</strong> Add <code className="bg-bg-primary px-1 rounded">GEMMA4_ENABLED=true</code> and{" "}
          <code className="bg-bg-primary px-1 rounded">GEMMA4_MODEL=gemma4:26b-a4b</code> to your .env,
          download the model in LM Studio, then rebuild the gateway. See the deploy tabs below for detailed steps.
        </Alert>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "overview" && <OverviewTab />}
      {tab === "models" && <ModelsTab />}
      {tab === "deploy-local" && (
        <DeployTab
          title="Local Deployment via LM Studio"
          description="Run Gemma 4 directly on your GPU cluster via LM Studio + LM Link. Zero cost, maximum sovereignty."
          steps={LM_STUDIO_STEPS}
          expandedStep={expandedStep}
          onToggleStep={setExpandedStep}
        />
      )}
      {tab === "deploy-docker" && (
        <DeployTab
          title="Docker Container Deployment"
          description="Run Gemma 4 in an isolated container with GPU passthrough. Ideal for multi-node or headless setups."
          steps={DOCKER_STEPS}
          expandedStep={expandedStep}
          onToggleStep={setExpandedStep}
        />
      )}
      {tab === "deploy-cloud" && (
        <DeployTab
          title="Gemini API Free Cloud"
          description="Use Google's free Gemini API as a cloud fallback for Gemma 4. No cost for standard usage."
          steps={CLOUD_STEPS}
          expandedStep={expandedStep}
          onToggleStep={setExpandedStep}
        />
      )}
      {tab === "architecture" && <ArchitectureTab />}
    </div>
  );
}

/* ─── Sub-Components ───────────────────────────────────────── */

function OverviewTab() {
  return (
    <div className="space-y-6">
      {/* Why Gemma 4 */}
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-accent" /> Why Gemma 4 Changes Everything
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-bg-secondary border border-border/30">
            <div className="text-3xl font-bold text-accent mb-1">89.2%</div>
            <div className="text-sm text-text-secondary">AIME 2026 Score</div>
            <div className="text-xs text-text-muted mt-1">vs Gemma 3: 20.8% — 4× improvement</div>
          </div>
          <div className="p-4 rounded-lg bg-bg-secondary border border-border/30">
            <div className="text-3xl font-bold text-success mb-1">3.8B</div>
            <div className="text-sm text-text-secondary">Active Params (MoE)</div>
            <div className="text-xs text-text-muted mt-1">26B total, only 3.8B per token — fast as 4B</div>
          </div>
          <div className="p-4 rounded-lg bg-bg-secondary border border-border/30">
            <div className="text-3xl font-bold text-info mb-1">256K</div>
            <div className="text-sm text-text-secondary">Context Window</div>
            <div className="text-xs text-text-muted mt-1">Full action history + system state awareness</div>
          </div>
        </div>
      </Card>

      {/* Key Capabilities */}
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-4 flex items-center gap-2">
          <Zap size={18} className="text-warning" /> Key Capabilities for HoC
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              title: "Native Function Calling",
              desc: "No brittle JSON schema workarounds — Gemma 4 natively understands tool declarations",
              badge: "P0",
              badgeVariant: "success" as const,
            },
            {
              title: "Thinking Mode",
              desc: "Chain-of-thought reasoning with <|think|> tokens — stripped before action parsing",
              badge: "P0",
              badgeVariant: "success" as const,
            },
            {
              title: "Multimodal Perception",
              desc: "E2B supports image, video, and audio — citizens can analyze ComfyUI outputs",
              badge: "P1",
              badgeVariant: "info" as const,
            },
            {
              title: "Apache 2.0 License",
              desc: "Full rights to fine-tune, deploy, and modify — no usage restrictions",
              badge: "Core",
              badgeVariant: "purple" as const,
            },
            {
              title: "LM Studio + LM Link",
              desc: "Routes through existing cluster — TITAN RTX, 3090 Ti, Blackwell nodes",
              badge: "Infra",
              badgeVariant: "warning" as const,
            },
            {
              title: "Free Cloud Fallback",
              desc: "Gemini API provides free Gemma 4 cloud inference as safety net",
              badge: "Fallback",
              badgeVariant: "neutral" as const,
            },
          ].map((cap) => (
            <div
              key={cap.title}
              className="p-3 rounded-lg bg-bg-secondary border border-border/30 flex items-start gap-3"
            >
              <CheckCircle2 size={16} className="text-success mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-text-primary font-medium text-sm">{cap.title}</span>
                  <Badge variant={cap.badgeVariant}>{cap.badge}</Badge>
                </div>
                <p className="text-text-muted text-xs">{cap.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Inference Fallback Chain */}
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-4 flex items-center gap-2">
          <GitBranch size={18} className="text-info" /> Inference Fallback Chain
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[
            { label: "Tier-0 (Math)", variant: "neutral" as const },
            { label: "Gemma 4 via LM Studio", variant: "success" as const },
            { label: "LM Studio (Qwen3)", variant: "info" as const },
            { label: "Cloud (Groq/NIM)", variant: "warning" as const },
            { label: "Gemini Cloud Free", variant: "purple" as const },
          ].map((step, i) => (
            <span key={step.label} className="flex items-center gap-2">
              {i > 0 && <ArrowRight size={14} className="text-text-muted" />}
              <Badge variant={step.variant}>{step.label}</Badge>
            </span>
          ))}
        </div>
        <p className="text-text-muted text-xs mt-3">
          Citizens use deterministic math for ~80% of decisions.
          Gemma 4 handles complex reasoning for elite citizens.
          Cloud fallbacks are only reached when local infrastructure is offline.
        </p>
      </Card>
    </div>
  );
}

function ModelsTab() {
  return (
    <div className="space-y-4">
      {MODELS.map((m) => (
        <Card key={m.id} glass hover>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="text-text-heading font-semibold flex items-center gap-2">
                <Brain size={16} className="text-accent" />
                {m.name}
              </h4>
              <p className="text-text-muted text-xs mt-1 font-mono">{m.id}</p>
            </div>
            <Badge variant={
              m.tier === "Standard" ? "purple" :
              m.tier === "Local" ? "success" : "info"
            }>
              {m.tier} Tier
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
            <div>
              <span className="text-text-muted text-xs">Total Params</span>
              <div className="text-text-primary font-medium">{m.params}</div>
            </div>
            <div>
              <span className="text-text-muted text-xs">Active Params</span>
              <div className="text-text-primary font-medium">{m.activeParams}</div>
            </div>
            <div>
              <span className="text-text-muted text-xs">VRAM</span>
              <div className="text-text-primary font-medium">{m.vram}</div>
            </div>
            <div>
              <span className="text-text-muted text-xs">Context</span>
              <div className="text-text-primary font-medium">{m.context}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <ProgressBar
                value={m.quality * 100}
                max={100}
                labelLeft="Quality"
                labelRight={`${(m.quality * 100).toFixed(0)}%`}
                size="sm"
              />
            </div>
            <div>
              <ProgressBar
                value={m.speed * 100}
                max={100}
                labelLeft="Speed"
                labelRight={`${(m.speed * 100).toFixed(0)}%`}
                size="sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Cpu size={12} className="text-text-muted" />
            <span className="text-text-muted">Best GPU:</span>
            <span className="text-text-secondary">{m.gpu}</span>
            <span className="text-text-muted ml-2">•</span>
            <span className="text-text-muted ml-1">Best for:</span>
            <span className="text-text-secondary">{m.bestFor}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function DeployTab({
  title,
  description,
  steps,
  expandedStep,
  onToggleStep,
}: {
  title: string;
  description: string;
  steps: DeployStep[];
  expandedStep: string | null;
  onToggleStep: (id: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-2 flex items-center gap-2">
          <BookOpen size={18} className="text-accent" /> {title}
        </h3>
        <p className="text-text-secondary text-sm">{description}</p>
      </Card>

      {steps.map((step, idx) => {
        const isExpanded = expandedStep === step.id;
        return (
          <Card key={step.id} glass hover>
            <button
              className="w-full text-left flex items-start gap-3"
              onClick={() => onToggleStep(isExpanded ? null : step.id)}
              aria-label={`Toggle step ${idx + 1}: ${step.title}`}
            >
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </div>
                {isExpanded ? (
                  <ChevronDown size={14} className="text-text-muted" />
                ) : (
                  <ChevronRight size={14} className="text-text-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-accent">{step.icon}</span>
                  <span className="text-text-heading font-medium text-sm">{step.title}</span>
                </div>
                {!isExpanded && (
                  <p className="text-text-muted text-xs mt-1 truncate">{step.description}</p>
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="mt-3 ml-11 space-y-3">
                <p className="text-text-secondary text-sm">{step.description}</p>

                {step.commands && step.commands.length > 0 && (
                  <div className="bg-bg-primary rounded-lg p-3 border border-border/30">
                    <pre className="text-xs font-mono text-text-primary overflow-x-auto whitespace-pre-wrap">
                      {step.commands.join("\n")}
                    </pre>
                  </div>
                )}

                {step.notes && (
                  <div className="text-xs text-text-muted flex items-start gap-1.5">
                    <Eye size={12} className="shrink-0 mt-0.5" />
                    <span>{step.notes}</span>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ArchitectureTab() {
  return (
    <div className="space-y-6">
      {/* Inference Pipeline */}
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-4 flex items-center gap-2">
          <GitBranch size={18} className="text-accent" /> Inference Pipeline Architecture
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
          {[
            {
              step: "1. Model Council",
              desc: "Selects Gemma 4 variant based on citizen tier + GPU VRAM",
              icon: <Brain size={16} />,
            },
            {
              step: "2. Prompt Strategy",
              desc: "buildGemma4Prompt() — native function calls + thinking mode",
              icon: <BookOpen size={16} />,
            },
            {
              step: "3. LM Link Router",
              desc: "selectBestLMLinkNode() picks optimal GPU with loaded model",
              icon: <Server size={16} />,
            },
            {
              step: "4. LM Studio API",
              desc: "/v1/chat/completions with JSON mode + response_format",
              icon: <Monitor size={16} />,
            },
            {
              step: "5. Parse + Execute",
              desc: "Strip thinking tokens → parseActionJSON → execute tool",
              icon: <Zap size={16} />,
            },
          ].map((p) => (
            <div
              key={p.step}
              className="p-3 rounded-lg bg-bg-secondary border border-border/30 text-center"
            >
              <div className="text-accent mb-1 flex justify-center">{p.icon}</div>
              <div className="font-medium text-text-primary">{p.step}</div>
              <div className="text-text-muted text-xs mt-1">{p.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Files Changed */}
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-4 flex items-center gap-2">
          <Wrench size={18} className="text-warning" /> Integration Files
        </h3>
        <div className="space-y-2">
          {[
            {
              file: "src/republic/model-council.ts",
              desc: "4 Gemma 4 entries in MODEL_CATALOG (26B MoE, 31B, E4B, E2B)",
              change: "+4 entries",
            },
            {
              file: "src/republic/inference-strategy.ts",
              desc: "buildGemma4Prompt() + buildGemma4EdgePrompt() strategies",
              change: "+2 strategies",
            },
            {
              file: "src/republic/cloud-inference.ts",
              desc: "gemma4Inference() via LM Studio + Gemini cloud fallback",
              change: "+1 engine",
            },
          ].map((f) => (
            <div
              key={f.file}
              className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Circle size={8} className="text-accent shrink-0" />
                <code className="text-xs text-text-primary font-mono truncate">{f.file}</code>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-text-muted text-xs hidden md:inline">{f.desc}</span>
                <Badge variant="success">{f.change}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* GPU Cluster Map */}
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-4 flex items-center gap-2">
          <Cpu size={18} className="text-info" /> GPU Cluster Recommended Layout
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              gpu: "TITAN RTX (24GB)",
              model: "Gemma 4 26B MoE (Q4)",
              vram: "~18 GB",
              headroom: "~6 GB free",
            },
            {
              gpu: "RTX 3090 Ti (24GB)",
              model: "Gemma 4 E4B + Qwen3-8B",
              vram: "~5 + ~10.5 GB",
              headroom: "~8.5 GB free",
            },
            {
              gpu: "RTX 6000 Blackwell (48GB)",
              model: "Gemma 4 31B Dense (Q8)",
              vram: "~32 GB",
              headroom: "~16 GB free",
            },
          ].map((node) => (
            <div key={node.gpu} className="p-4 rounded-lg bg-bg-secondary border border-border/30">
              <div className="text-text-heading font-semibold text-sm mb-2">{node.gpu}</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Model:</span>
                  <span className="text-text-primary">{node.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">VRAM Used:</span>
                  <span className="text-text-primary">{node.vram}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Headroom:</span>
                  <span className="text-success">{node.headroom}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Next Steps */}
      <Card glass>
        <h3 className="text-text-heading font-semibold mb-4 flex items-center gap-2">
          <ArrowRight size={18} className="text-purple" /> Remaining Phases
        </h3>
        <div className="space-y-2 text-sm">
          {[
            { phase: "Phase 3: Cognitive Loop", desc: "Use thinking mode for elite citizen reflection", done: false },
            { phase: "Phase 4: Multimodal", desc: "Vision perception for ComfyUI/Wan2GP analysis", done: false },
            { phase: "Phase 5: Genetic Integration", desc: "Model-aware fitness scoring in evolution engine", done: false },
            { phase: "Phase 7: QLoRA Fine-Tuning", desc: "GRPO fine-tuning on HoC decision patterns", done: false },
          ].map((p) => (
            <div
              key={p.phase}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-secondary transition-colors"
            >
              {p.done ? (
                <CheckCircle2 size={16} className="text-success shrink-0" />
              ) : (
                <Circle size={16} className="text-text-muted shrink-0" />
              )}
              <div>
                <span className="text-text-primary font-medium">{p.phase}</span>
                <span className="text-text-muted ml-2">— {p.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
