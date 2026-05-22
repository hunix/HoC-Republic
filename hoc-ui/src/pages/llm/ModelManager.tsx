/**
 * Model Manager — full local model download/delete/activate UI.
 *
 * Features:
 *  - Hardware-aware: shows RAM compatibility badge for each model
 *  - Real-time download progress with speed and ETA
 *  - Pause / resume downloads with state persistence
 *  - Filters by category (GGUF, BitNet, Diffusion, TTS, Audio, 3D, Face, etc.)
 *  - Ollama model management (list, pull, delete)
 *  - LM Studio model discovery
 *  - System prerequisites check (Python, CUDA, git, HF CLI)
 *  - Disk usage summary
 */

import {
  Download,
  Trash2,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  Cpu,
  Zap,
  Search,
  MemoryStick,
  AlertTriangle,
  XCircle,
  Play,
  Pause,
  PackageOpen,
  Layers,
  Image,
  Mic,
  Music,
  Box,
  Scan,
  Monitor,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { PageHeader, Card, Button, Tabs, StatCard, Badge, RpcStatus } from "@/components/ui";
import { rpc, useRpc } from "@/lib/rpc";
import { useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModelCategory =
  | "gguf"
  | "bitnet"
  | "plugin"
  | "embedding"
  | "ollama"
  | "diffusion"
  | "tts"
  | "audio"
  | "3d"
  | "face";

interface ManagedModel {
  id: string;
  name: string;
  category: ModelCategory;
  repo: string;
  filename: string;
  localPath?: string;
  sizeBytes?: number;
  status: "available" | "downloading" | "downloaded" | "error" | "paused";
  downloadProgress?: number;
  downloadSpeed?: number;
  description: string;
  ramGB: number;
  diskGB: number;
  quantization?: string;
  capabilities: string[];
  license: string;
  isCore: boolean;
  ollamaTag?: string;
  vramGB?: number;
  pluginId?: string;
  prerequisites?: string[];
  downloadType?: "single-file" | "hf-repo" | "git-clone";
}

interface CatalogResponse {
  models: ManagedModel[];
  freeRamGB: number;
  totalRamGB?: number;
  totalVramGB?: number;
  gpus?: Array<{ name: string; vramGB: number }>;
}

interface DiskResponse {
  totalGB: number;
  bitnetGB: number;
  ggufGB: number;
  pluginGB: number;
  lmStudioGB?: number;
  ollamaGB?: number;
  hfCacheGB?: number;
  dataDir: string;
  lmStudioDir?: string;
  ollamaDir?: string;
  hfCacheDir?: string;
}

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

interface PrereqCheck {
  available: boolean;
  version?: string;
  path?: string;
}

interface LmStudioModel {
  name: string;
  path: string;
  sizeBytes: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSize(bytes: number) {
  if (bytes >= 1e9) {
    return `${(bytes / 1e9).toFixed(2)} GB`;
  }
  if (bytes >= 1e6) {
    return `${(bytes / 1e6).toFixed(0)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function ramCompatLabel(ramGB: number, freeRamGB: number) {
  const headroom = Math.max(freeRamGB - 2, 0);
  if (ramGB <= headroom) {
    return { label: "Fits", color: "text-success" };
  }
  if (ramGB <= freeRamGB) {
    return { label: "Tight", color: "text-warning" };
  }
  return { label: "Too large", color: "text-red-400" };
}

function categoryIcon(cat: string) {
  switch (cat) {
    case "bitnet":
      return <Zap size={14} />;
    case "gguf":
      return <Cpu size={14} />;
    case "embedding":
      return <Layers size={14} />;
    case "plugin":
      return <PackageOpen size={14} />;
    case "ollama":
      return <Play size={14} />;
    case "diffusion":
      return <Image size={14} />;
    case "tts":
      return <Mic size={14} />;
    case "audio":
      return <Music size={14} />;
    case "3d":
      return <Box size={14} />;
    case "face":
      return <Scan size={14} />;
    default:
      return <HardDrive size={14} />;
  }
}

// ─── Model Card ───────────────────────────────────────────────────────────────

function ModelCard({
  model,
  freeRamGB,
  onDownload,
  onDelete,
  onPause,
  onResume,
}: {
  model: ManagedModel;
  freeRamGB: number;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const isDownloaded = model.status === "downloaded";
  const isDownloading = model.status === "downloading";
  const isPaused = model.status === "paused";
  const compat = ramCompatLabel(model.ramGB, freeRamGB);
  const progress = model.downloadProgress ?? 0;
  const speed = model.downloadSpeed ?? 0;

  return (
    <Card className="flex flex-col gap-3 relative overflow-hidden">
      {/* Core badge */}
      {model.isCore && (
        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-accent/20 text-accent uppercase tracking-wide">
          Core
        </span>
      )}
      {/* Plugin badge */}
      {model.pluginId && !model.isCore && (
        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] bg-info/20 text-info uppercase tracking-wide">
          Plugin
        </span>
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isDownloaded
              ? "bg-success/10"
              : isDownloading
                ? "bg-accent/10 animate-pulse"
                : isPaused
                  ? "bg-warning/10"
                  : "bg-bg-input"
          }`}
        >
          <span
            className={
              isDownloaded
                ? "text-success"
                : isDownloading
                  ? "text-accent"
                  : isPaused
                    ? "text-warning"
                    : "text-text-muted"
            }
          >
            {categoryIcon(model.category)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-heading line-clamp-1">{model.name}</h3>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] text-text-muted">{model.category.toUpperCase()}</span>
            {model.quantization && (
              <span className="px-1 py-0.5 rounded text-[9px] bg-bg-input text-text-muted font-mono">
                {model.quantization}
              </span>
            )}
            {model.downloadType === "hf-repo" && (
              <span className="px-1 py-0.5 rounded text-[9px] bg-info/10 text-info">HF Repo</span>
            )}
            {model.downloadType === "git-clone" && (
              <span className="px-1 py-0.5 rounded text-[9px] bg-warning/10 text-warning">Git</span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-text-muted line-clamp-2 flex-1">{model.description}</p>

      {/* Metadata row */}
      <div className="flex items-center gap-3 text-[11px] text-text-muted flex-wrap">
        <span className="flex items-center gap-1">
          <MemoryStick size={10} />
          {model.ramGB} GB RAM
        </span>
        <span className="flex items-center gap-1">
          <HardDrive size={10} />~{model.diskGB} GB disk
        </span>
        {model.vramGB != null && model.vramGB > 0 && (
          <span className="flex items-center gap-1">
            <Cpu size={10} />
            {model.vramGB} GB VRAM
          </span>
        )}
        {isDownloaded && model.sizeBytes && (
          <span className="text-success/80">{fmtSize(model.sizeBytes)}</span>
        )}
        <span className={`ml-auto font-medium ${compat.color}`}>{compat.label}</span>
      </div>

      {/* Progress bar */}
      {(isDownloading || isPaused) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>
              {progress}%{isPaused && " · Paused"}
            </span>
            <span>
              {isDownloading && speed > 0 ? `${speed} MB/s` : isPaused ? "⏸" : "Starting…"}
            </span>
          </div>
          <div className="h-1.5 bg-bg-input rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${isPaused ? "bg-warning" : "bg-accent"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1">
        {model.capabilities.slice(0, 4).map((cap) => (
          <span key={cap} className="px-1.5 py-0.5 rounded text-[9px] bg-bg-input text-text-muted">
            {cap}
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/40 mt-auto">
        {isDownloaded ? (
          <>
            <div className="flex items-center gap-1 text-success text-xs font-medium">
              <CheckCircle2 size={13} />
              Downloaded
            </div>
            <button
              type="button"
              className="ml-auto p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
              onClick={() => onDelete(model.id)}
              aria-label="Delete model"
            >
              <Trash2 size={13} />
            </button>
          </>
        ) : isDownloading ? (
          <>
            <div className="flex items-center gap-1 text-accent text-xs font-medium">
              <RefreshCw size={12} className="animate-spin" />
              Downloading…
            </div>
            <button
              type="button"
              className="ml-auto p-1.5 rounded-lg hover:bg-warning/10 text-text-muted hover:text-warning transition-colors"
              onClick={() => onPause(model.id)}
              aria-label="Pause download"
            >
              <Pause size={13} />
            </button>
          </>
        ) : isPaused ? (
          <>
            <div className="flex items-center gap-1 text-warning text-xs font-medium">
              <Pause size={12} />
              Paused · {progress}%
            </div>
            <button
              type="button"
              className="ml-auto p-1.5 rounded-lg hover:bg-accent/10 text-text-muted hover:text-accent transition-colors"
              onClick={() => onResume(model.id)}
              aria-label="Resume download"
            >
              <Play size={13} />
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              compat.label === "Too large"
                ? "bg-bg-input text-text-muted cursor-not-allowed"
                : "bg-accent/10 text-accent hover:bg-accent/20"
            }`}
            onClick={() => compat.label !== "Too large" && onDownload(model.id)}
            disabled={compat.label === "Too large"}
          >
            <Download size={12} />
            Download
          </button>
        )}
      </div>
    </Card>
  );
}

// ─── Ollama Section ───────────────────────────────────────────────────────────

function OllamaSection() {
  const { data, loading, refetch, error } = useRpc<{ models: OllamaModel[] }>(
    "models.manager.ollama.list",
    {},
  );
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullInput, setPullInput] = useState("");

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const pull = async () => {
    if (!pullInput.trim()) {
      return;
    }
    setPulling(pullInput.trim());
    try {
      await rpc("models.manager.ollama.pull", { tag: pullInput.trim() });
    } catch {
      /* silent */
    }
    setPulling(null);
    setPullInput("");
    setTimeout(refetch, 2000);
  };

  const del = async (name: string) => {
    try {
      await rpc("models.manager.ollama.delete", { name });
    } catch {
      /* silent */
    }
    refetch();
  };

  const models = data?.models ?? [];

  return (
    <div className="space-y-4">
      {/* Pull input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={pullInput}
          onChange={(e) => setPullInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void pull()}
          placeholder="e.g. llama3.2 or phi4:latest"
          className="flex-1 bg-bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus focus:ring-2 focus:ring-accent-glow transition-all"
        />
        <Button
          onClick={() => void pull()}
          disabled={!!pulling || !pullInput.trim()}
          icon={pulling ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
        >
          {pulling ? "Pulling..." : "Pull"}
        </Button>
      </div>

      {/* Model list */}
      {loading ? (
        <div className="text-sm text-text-muted py-6 text-center">Checking Ollama…</div>
      ) : models.length === 0 ? (
        <div className="text-sm text-text-muted py-6 text-center flex flex-col items-center gap-2">
          <AlertTriangle size={24} className="opacity-40" />
          No Ollama models found. Is Ollama running?
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {models.map((m) => (
            <Card key={m.name} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                <Play size={14} className="text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-heading truncate">{m.name}</p>
                <p className="text-[10px] text-text-muted">{fmtSize(m.size)}</p>
              </div>
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors flex-shrink-0"
                onClick={() => void del(m.name)}
                aria-label="Delete"
              >
                <Trash2 size={12} />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Prerequisites Card ───────────────────────────────────────────────────────

function PrerequisitesCard() {
  const { data, loading, refetch } = useRpc<{
    prerequisites: Record<
      string,
      PrereqCheck & {
        installCmd?: string;
        installUrl?: string;
        installHint?: string;
        autoInstallable?: boolean;
      }
    >;
  }>("models.manager.prerequisites", {}, [], { staleTimeMs: 30000 });

  const [installing, setInstalling] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<{
    name: string;
    ok: boolean;
    message: string;
  } | null>(null);

  const handleInstall = useCallback(
    async (name: string) => {
      setInstalling(name);
      setInstallResult(null);
      try {
        const res = (await rpc("models.manager.install", { prerequisite: name })) as {
          installed?: boolean;
          output?: string;
        };
        setInstallResult({
          name,
          ok: !!res?.installed,
          message: res?.installed ? "Installed successfully!" : "Install returned no result",
        });
        setTimeout(() => refetch(), 2000);
      } catch (err) {
        setInstallResult({
          name,
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      setInstalling(null);
    },
    [refetch],
  );

  if (loading || !data) {
    return null;
  }

  const checks = data.prerequisites;
  const entries = Object.entries(checks);
  const available = entries.filter(([, v]) => v.available).length;
  const total = entries.length;
  const allGood = available === total;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        {allGood ? (
          <ShieldCheck size={16} className="text-success" />
        ) : (
          <ShieldX size={16} className="text-warning" />
        )}
        <span className="text-sm font-semibold text-text-heading">System Prerequisites</span>
        <Badge variant={allGood ? "success" : "warning"} className="ml-auto">
          {available}/{total}
        </Badge>
      </div>

      {/* Install result toast */}
      {installResult && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
            installResult.ok ? "bg-success/10 text-success" : "bg-red-500/10 text-red-400"
          }`}
        >
          {installResult.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
          <span className="font-medium capitalize">{installResult.name.replace(/_/g, " ")}:</span>
          <span className="truncate">{installResult.message}</span>
          <button
            type="button"
            className="ml-auto text-text-muted hover:text-text-primary"
            onClick={() => setInstallResult(null)}
            aria-label="Dismiss"
          >
            <XCircle size={12} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {entries.map(([name, check]) => (
          <div
            key={name}
            className={`flex flex-col gap-1.5 px-3 py-2.5 rounded-lg text-xs ${
              check.available ? "bg-success/5" : "bg-red-500/5"
            }`}
          >
            {/* Header row */}
            <div className="flex items-center gap-2">
              {check.available ? (
                <CheckCircle2 size={12} className="text-success flex-shrink-0" />
              ) : (
                <XCircle size={12} className="text-red-400 flex-shrink-0" />
              )}
              <span
                className={`font-medium capitalize ${check.available ? "text-success" : "text-red-400"}`}
              >
                {name.replace(/_/g, " ")}
              </span>
            </div>

            {/* Version */}
            {check.available && check.version && (
              <p className="text-[10px] text-text-muted truncate pl-5" title={check.version}>
                {check.version}
              </p>
            )}

            {/* Missing: show hint + actions */}
            {!check.available && (
              <>
                {check.installHint && (
                  <p className="text-[10px] text-text-muted pl-5 leading-relaxed">
                    {check.installHint}
                  </p>
                )}

                {/* Install command preview */}
                {check.installCmd && (
                  <code className="text-[9px] text-text-muted bg-bg-primary/50 px-2 py-1 rounded font-mono ml-5 break-all select-all">
                    {check.installCmd}
                  </code>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 pl-5 pt-0.5">
                  {check.autoInstallable && (
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                      onClick={() => void handleInstall(name)}
                      disabled={installing === name}
                    >
                      {installing === name ? (
                        <>
                          <RefreshCw size={10} className="animate-spin" />
                          Installing…
                        </>
                      ) : (
                        <>
                          <Download size={10} />
                          Auto Install
                        </>
                      )}
                    </button>
                  )}
                  {check.installUrl && (
                    <a
                      href={check.installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-bg-input text-text-muted hover:text-text-primary hover:bg-bg-input/80 transition-colors"
                    >
                      Download ↗
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── LM Studio Section ────────────────────────────────────────────────────────

function LmStudioSection() {
  const { data, loading, refetch, error } = useRpc<{
    models: LmStudioModel[];
    lmStudioDir: string;
  }>("models.manager.lmstudio.list", {});

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const models = data?.models ?? [];

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-3 py-3">
        <Monitor size={16} className="text-text-muted" />
        <span className="text-xs text-text-muted">Scanning:</span>
        <code className="text-xs text-text-secondary truncate">{data?.lmStudioDir ?? "—"}</code>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={refetch}
          icon={<RefreshCw size={12} />}
        >
          Rescan
        </Button>
      </Card>

      {models.length === 0 ? (
        <div className="text-sm text-text-muted py-6 text-center flex flex-col items-center gap-2">
          <Monitor size={24} className="opacity-40" />
          No GGUF models found in LM Studio directory.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {models.map((m) => (
            <Card key={m.path} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center flex-shrink-0">
                <Monitor size={14} className="text-info" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-heading truncate">{m.name}</p>
                <p className="text-[10px] text-text-muted">{fmtSize(m.sizeBytes)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "all", label: "All" },
  { id: "gguf", label: "GGUF" },
  { id: "bitnet", label: "BitNet" },
  { id: "embedding", label: "Embeddings" },
  { id: "diffusion", label: "Diffusion" },
  { id: "video", label: "Video" },
  { id: "tts", label: "TTS" },
  { id: "audio", label: "Audio" },
  { id: "3d", label: "3D" },
  { id: "face", label: "Face" },
  { id: "ollama", label: "Ollama" },
  { id: "lmstudio", label: "LM Studio" },
];

export function ModelManagerPage() {
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [hfToken, setHfToken] = useState("");
  const [hfTokenSaved, setHfTokenSaved] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const hfSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load HF token from .env on mount
  const { data: envData } = useRpc<{ env: Record<string, string> }>("config.env.get", {});
  useEffect(() => {
    if (envData?.env) {
      const saved = envData.env.HUGGINGFACE_HUB_TOKEN || envData.env.HF_TOKEN || "";
      if (saved && !hfToken) {
        setHfToken(saved);
      }
    }
  }, [envData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save HF token to .env (debounced 1.5s)
  const handleHfTokenChange = useCallback((value: string) => {
    setHfToken(value);
    setHfTokenSaved(false);
    if (hfSaveTimer.current) {
      clearTimeout(hfSaveTimer.current);
    }
    hfSaveTimer.current = setTimeout(async () => {
      try {
        await rpc("config.env.set", { env: { HF_TOKEN: value } });
        setHfTokenSaved(true);
        setTimeout(() => setHfTokenSaved(false), 3000);
      } catch {
        /* silent — env save failed */
      }
    }, 1500);
  }, []);
  // Overlay progress from the lightweight poll — keyed by model id
  const [progressOverlay, setProgressOverlay] = useState<
    Record<
      string,
      {
        progress: number;
        speed: number;
        status: "downloading" | "paused" | "error";
        error?: string;
      }
    >
  >({});

  const { data, loading, error, refetch } = useRpc<CatalogResponse>("models.manager.catalog", {});
  const { data: diskData, refetch: refetchDisk } = useRpc<DiskResponse>("models.manager.disk", {});

  // Lightweight progress poll — calls models.manager.progress every 2s
  // This avoids refetching the full catalog (which caused the UI snap-back bug).
  useEffect(() => {
    const poll = async () => {
      try {
        const { rpc: fetchRpc } = await import("@/lib/rpc");
        const res = (await fetchRpc("models.manager.progress", {})) as {
          progress?: Record<
            string,
            {
              progress: number;
              speed: number;
              totalBytes: number;
              downloadedBytes: number;
              error?: string;
            }
          >;
        };
        const p = res?.progress ?? {};
        const overlay: typeof progressOverlay = {};
        for (const [id, dl] of Object.entries(p)) {
          overlay[id] = {
            progress: dl.progress,
            speed: dl.speed,
            status: dl.error ? "error" : "downloading",
            error: dl.error,
          };
        }
        setProgressOverlay(overlay);
      } catch {
        /* silent — gateway may be momentarily unavailable */
      }
    };

    const timer = setInterval(() => {
      void poll();
    }, 2000);
    void poll(); // initial call
    return () => clearInterval(timer);
  }, []); // runs always — progress endpoint is cheap (O(activeDownloads))

  // Merge catalog models with live progress overlay
  const mergedModels: ManagedModel[] = (data?.models ?? []).map((m) => {
    const ov = progressOverlay[m.id];
    if (!ov) {
      return m;
    }
    return {
      ...m,
      status: ov.status === "error" ? "error" : m.status === "paused" ? "paused" : "downloading",
      downloadProgress: ov.progress,
      downloadSpeed: ov.speed,
    };
  });

  const handleDownload = useCallback(
    async (id: string) => {
      try {
        await rpc("models.manager.download", { id, hfToken: hfToken || undefined });
        // Refetch catalog after short delay to get updated status
        setTimeout(() => {
          refetch();
        }, 800);
      } catch (e) {
        console.error("Download failed:", e);
      }
    },
    [hfToken, refetch],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this model file from disk?")) {
        return;
      }
      try {
        await rpc("models.manager.delete", { id });
        refetch();
        refetchDisk();
      } catch (e) {
        console.error("Delete failed:", e);
      }
    },
    [refetch, refetchDisk],
  );

  const handlePause = useCallback(
    async (id: string) => {
      try {
        await rpc("models.manager.pause", { id });
        // Update overlay immediately to avoid wait
        setProgressOverlay((prev) => ({
          ...prev,
          [id]: { ...prev[id], status: "paused" },
        }));
        setTimeout(() => {
          refetch();
        }, 500);
      } catch (e) {
        console.error("Pause failed:", e);
      }
    },
    [refetch],
  );

  const handleResume = useCallback(
    async (id: string) => {
      try {
        await rpc("models.manager.resume", { id, hfToken: hfToken || undefined });
        setProgressOverlay((prev) => ({
          ...prev,
          [id]: { ...prev[id], status: "downloading" },
        }));
        setTimeout(() => {
          refetch();
        }, 500);
      } catch (e) {
        console.error("Resume failed:", e);
      }
    },
    [hfToken, refetch],
  );

  const models = mergedModels;
  const freeRamGB = data?.freeRamGB ?? 8;
  const totalVramGB = data?.totalVramGB ?? 0;
  const gpuNames = (data?.gpus ?? []).map((g) => g.name).join(" + ") || null;

  const downloadedCount = models.filter((m) => m.status === "downloaded").length;
  const downloadingCount = models.filter((m) => m.status === "downloading").length;
  const pausedCount = models.filter((m) => m.status === "paused").length;
  const totalDiskGB = diskData?.totalGB ?? 0;

  const filtered = models.filter((m) => {
    if (tab !== "all" && tab !== "ollama" && tab !== "lmstudio" && m.category !== tab) {
      return false;
    }
    if (tab === "ollama" || tab === "lmstudio") {
      return false;
    }
    if (
      search &&
      !m.name.toLowerCase().includes(search.toLowerCase()) &&
      !m.description.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        title="Model Manager"
        description={
          loading
            ? "Loading model catalog…"
            : error
              ? "Gateway unavailable — showing empty catalog"
              : `${downloadedCount} downloaded · ${models.length} total${totalVramGB > 0 ? ` · ${totalVramGB} GB VRAM` : ` · ${freeRamGB} GB RAM free`}${gpuNames ? ` · ${gpuNames}` : ""}`
        }
        icon={<HardDrive size={28} />}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => {
              refetch();
              refetchDisk();
            }}
          >
            Refresh
          </Button>
        }
      />

      {/* Summary Stats */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Downloaded" value={downloadedCount} icon={<CheckCircle2 size={14} />} />
          <StatCard label="Downloading" value={downloadingCount} icon={<Download size={14} />} />
          {pausedCount > 0 && (
            <StatCard label="Paused" value={pausedCount} icon={<Pause size={14} />} />
          )}
          <StatCard label="Total Models Disk" value={`${totalDiskGB} GB`} icon={<HardDrive size={14} />} />
          {totalVramGB > 0 ? (
            <StatCard label="Total VRAM" value={`${totalVramGB} GB`} icon={<Cpu size={14} />} />
          ) : (
            <StatCard label="Free RAM" value={`${freeRamGB} GB`} icon={<MemoryStick size={14} />} />
          )}
        </div>
      )}

      {/* Disk breakdown */}
      {diskData && diskData.totalGB > 0 && (
        <Card className="space-y-2 py-3">
          <span className="text-xs text-text-muted font-medium">Disk breakdown (all model storage locations):</span>
          <div className="flex flex-wrap items-center gap-4">
            {diskData.bitnetGB > 0 && (
              <span className="text-xs text-text-muted">
                BitNet: <strong className="text-text-primary">{diskData.bitnetGB} GB</strong>
              </span>
            )}
            {diskData.ggufGB > 0 && (
              <span className="text-xs text-text-muted">
                GGUF: <strong className="text-text-primary">{diskData.ggufGB} GB</strong>
              </span>
            )}
            {diskData.pluginGB > 0 && (
              <span className="text-xs text-text-muted">
                Plugins: <strong className="text-text-primary">{diskData.pluginGB} GB</strong>
              </span>
            )}
            {(diskData.lmStudioGB ?? 0) > 0 && (
              <span className="text-xs text-text-muted">
                LM Studio: <strong className="text-info">{diskData.lmStudioGB} GB</strong>
              </span>
            )}
            {(diskData.ollamaGB ?? 0) > 0 && (
              <span className="text-xs text-text-muted">
                Ollama: <strong className="text-success">{diskData.ollamaGB} GB</strong>
              </span>
            )}
            {(diskData.hfCacheGB ?? 0) > 0 && (
              <span className="text-xs text-text-muted">
                HF Cache: <strong className="text-warning">{diskData.hfCacheGB} GB</strong>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-text-muted/60">
            <span className="truncate max-w-xs" title={diskData.dataDir}>HoC: {diskData.dataDir}</span>
            {diskData.lmStudioDir && <span className="truncate max-w-xs" title={diskData.lmStudioDir}>LMS: {diskData.lmStudioDir}</span>}
            {diskData.ollamaDir && <span className="truncate max-w-xs" title={diskData.ollamaDir}>Ollama: {diskData.ollamaDir}</span>}
          </div>
        </Card>
      )}

      {/* Prerequisites Card */}
      <PrerequisitesCard />

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          <XCircle size={16} />
          Gateway RPC unavailable: {error}
        </div>
      )}

      {/* HF Token (collapsed by default) */}
      <Card className="py-3">
        <button
          type="button"
          className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors w-full text-left"
          onClick={() => setShowToken((v) => !v)}
        >
          🔑 HuggingFace token (for gated models like Llama)
          {hfTokenSaved && (
            <span className="text-success text-[10px] font-medium ml-1">✓ Saved</span>
          )}
          {hfToken && !hfTokenSaved && (
            <span className="text-success/60 text-[10px] ml-1">●</span>
          )}
          <span className="ml-auto">{showToken ? "▲" : "▼"}</span>
        </button>
        {showToken && (
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={hfToken}
              onChange={(e) => handleHfTokenChange(e.target.value)}
              placeholder="hf_..."
              className="flex-1 bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus focus:ring-2 focus:ring-accent-glow transition-all font-mono"
            />
            {hfToken && (
              <button
                type="button"
                onClick={() => handleHfTokenChange("")}
                className="px-3 py-2 rounded-lg text-xs text-text-muted hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Tab + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models…"
            className="w-full bg-bg-input border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus focus:ring-2 focus:ring-accent-glow transition-all"
          />
        </div>
        <Tabs
          tabs={TABS.map((t) => ({
            id: t.id,
            label: t.label,
            count:
              t.id === "all"
                ? models.length
                : t.id === "ollama" || t.id === "lmstudio"
                  ? undefined
                  : models.filter((m) => m.category === t.id).length,
          }))}
          active={tab}
          onChange={setTab}
        />
      </div>

      {/* Ollama Tab */}
      {tab === "ollama" && <OllamaSection />}

      {/* LM Studio Tab */}
      {tab === "lmstudio" && <LmStudioSection />}

      {/* Model Grid */}
      {tab !== "ollama" && tab !== "lmstudio" && (
        <>
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-52 rounded-xl bg-bg-card animate-pulse border border-border/30"
                />
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 text-text-muted">
              <HardDrive size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {models.length === 0 ? "No models in catalog." : "No models match your search."}
              </p>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  freeRamGB={freeRamGB}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  onPause={handlePause}
                  onResume={handleResume}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
