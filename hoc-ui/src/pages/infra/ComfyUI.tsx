import {
  Palette,
  Play,
  Pause,
  Square,
  RefreshCw,
  Download,
  Cpu,
  HardDrive,
  Monitor,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Image,
  Film,
  Sparkles,
  Box,
  Loader2,
  X,
  Clock,
  ArrowDown,
  Trash2,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert, RpcStatus, ProgressBar } from "@/components/ui";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface GPUInfo {
  available: boolean;
  name?: string;
  vram?: string;
  driverVersion?: string;
  cudaVersion?: string;
  error?: string;
}

interface ComfyModel {
  id: string;
  name: string;
  filename: string;
  type: "checkpoint" | "lora" | "vae" | "controlnet" | "upscaler" | "clip" | "unknown";
  sizeBytes: number;
  path: string;
}

interface ModelDownload {
  id: string;
  name: string;
  url: string;
  filename: string;
  type: ComfyModel["type"];
  description: string;
  sizeEstimate: string;
  requirements: string[];
}

interface ComfyUIStatus {
  ok: boolean;
  running: boolean;
  url: string;
  dockerAvailable: boolean;
  containerName: string | null;
  containerStatus: string | null;
  gpu: GPUInfo;
  installedModels: ComfyModel[];
  availableDownloads: ModelDownload[];
}

interface ModelListResult {
  ok: boolean;
  installed: ComfyModel[];
  available: ModelDownload[];
}

type DownloadState = "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";

interface DownloadProgress {
  id: string;
  modelId: string;
  modelName: string;
  state: DownloadState;
  bytesDownloaded: number;
  bytesTotal: number;
  percent: number;
  speedBps: number;
  speed: string;
  etaSeconds: number;
  eta: string;
  queuedAt: number;
  startedAt: number;
  endedAt: number;
  error?: string;
  destPath: string;
}

interface DownloadsStatus {
  ok: boolean;
  active: DownloadProgress[];
  queued: DownloadProgress[];
  completed: DownloadProgress[];
}

// ─── Helpers ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) { return "—"; }
  if (bytes < 1_000_000) { return `${(bytes / 1024).toFixed(0)} KB`; }
  if (bytes < 1_000_000_000) { return `${(bytes / 1_000_000).toFixed(1)} MB`; }
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

function modelTypeIcon(type: ComfyModel["type"]) {
  switch (type) {
    case "checkpoint": return <Box size={14} className="text-accent" />;
    case "lora": return <Sparkles size={14} className="text-purple" />;
    case "vae": return <Zap size={14} className="text-warning" />;
    case "upscaler": return <Image size={14} className="text-success" />;
    case "controlnet": return <Monitor size={14} className="text-info" />;
    case "clip": return <Film size={14} className="text-danger" />;
    default: return <Box size={14} className="text-text-muted" />;
  }
}

function modelTypeBadge(type: ComfyModel["type"]) {
  const variants: Record<string, "info" | "purple" | "warning" | "success" | "danger" | "neutral"> = {
    checkpoint: "info",
    lora: "purple",
    vae: "warning",
    upscaler: "success",
    controlnet: "info",
    clip: "danger",
  };
  return <Badge variant={variants[type] ?? "neutral"}>{type}</Badge>;
}

function stateColor(state: DownloadState) {
  switch (state) {
    case "downloading": return "text-accent";
    case "queued": return "text-text-muted";
    case "paused": return "text-warning";
    case "completed": return "text-success";
    case "failed": return "text-danger";
    case "cancelled": return "text-text-muted";
  }
}

function stateBadge(state: DownloadState) {
  const variants: Record<string, "info" | "warning" | "success" | "danger" | "neutral"> = {
    downloading: "info",
    queued: "neutral",
    paused: "warning",
    completed: "success",
    failed: "danger",
    cancelled: "neutral",
  };
  return <Badge variant={variants[state] ?? "neutral"}>{state}</Badge>;
}

// ─── Page Component ─────────────────────────────────────────────

export function ComfyUIPage() {
  // ── All hooks at the top ──────────────────────────────────────
  const { data, loading, error, refetch } = useRpc<ComfyUIStatus>(
    "republic.comfyui.status",
    {},
    [],
    { staleTimeMs: 60_000 }, // Long stale time — no auto-refresh
  );

  const { data: modelData, refetch: refetchModels } = useRpc<ModelListResult>(
    "republic.comfyui.models.list",
    {},
    [],
    { staleTimeMs: 60_000 },
  );

  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [downloads, setDownloads] = useState<DownloadsStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Determine if any downloads are in progress
  const hasActiveDownloads = (downloads?.active?.length ?? 0) > 0 || (downloads?.queued?.length ?? 0) > 0;

  // Poll download status — fast when active, slow otherwise
  const pollDownloads = useCallback(async () => {
    try {
      const res = await rpc<DownloadsStatus>("republic.comfyui.downloads.status");
      if (res) {
        setDownloads(res);
      }
    } catch {
      // Silent fail — polling will retry
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    pollDownloads();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [pollDownloads]);

  // Adaptive polling: 1.5s when downloading, 10s when idle
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }
    const interval = hasActiveDownloads ? 1500 : 10_000;
    pollRef.current = setInterval(pollDownloads, interval);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [hasActiveDownloads, pollDownloads]);

  // ── Loading/error guard ───────────────────────────────────────
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const showMsg = (type: "ok" | "err", text: string) => {
    setActionMsg({ type, text });
    if (type === "ok") { setTimeout(() => setActionMsg(null), 5000); }
  };

  // ── Actions ───────────────────────────────────────────────────

  async function launchComfyUI() {
    setActionMsg(null);
    setActionPending(true);
    try {
      const res = await rpc<{ ok: boolean; launched?: boolean; alreadyRunning?: boolean; error?: string }>(
        "republic.comfyui.launch",
      );
      if (res?.alreadyRunning) {
        showMsg("ok", "ComfyUI is already running.");
      } else if (res?.launched) {
        showMsg("ok", "ComfyUI container launched successfully! It may take 30–60s to fully start.");
      } else if (res?.error) {
        showMsg("err", res.error);
      } else {
        showMsg("ok", "Launch command sent.");
      }
      invalidateRpcCache("republic.comfyui.status");
      refetch();
    } catch (e) {
      showMsg("err", e instanceof Error ? e.message : String(e));
    } finally {
      setActionPending(false);
    }
  }

  async function startDownload(modelId: string) {
    try {
      const res = await rpc<{ ok: boolean; downloadId?: string; error?: string }>(
        "republic.comfyui.downloads.start",
        { modelId },
      );
      if (res?.ok) {
        showMsg("ok", `Download queued: ${res.downloadId}`);
        pollDownloads();
      } else {
        showMsg("err", res?.error ?? "Failed to start download");
      }
    } catch (e) {
      showMsg("err", e instanceof Error ? e.message : String(e));
    }
  }

  async function pauseDownload(downloadId: string) {
    try {
      await rpc("republic.comfyui.downloads.pause", { downloadId });
      pollDownloads();
    } catch (e) {
      showMsg("err", e instanceof Error ? e.message : String(e));
    }
  }

  async function resumeDownload(downloadId: string) {
    try {
      await rpc("republic.comfyui.downloads.resume", { downloadId });
      pollDownloads();
    } catch (e) {
      showMsg("err", e instanceof Error ? e.message : String(e));
    }
  }

  async function cancelDownload(downloadId: string) {
    try {
      await rpc("republic.comfyui.downloads.cancel", { downloadId });
      pollDownloads();
    } catch (e) {
      showMsg("err", e instanceof Error ? e.message : String(e));
    }
  }

  async function clearHistory() {
    try {
      await rpc("republic.comfyui.downloads.clear");
      pollDownloads();
    } catch {
      // ignore
    }
  }

  // ── Derived state ─────────────────────────────────────────────

  const isRunning = data?.running ?? false;
  const gpu = data?.gpu;
  const gpuAvailable = gpu?.available ?? false;
  const containerName = data?.containerName ?? "—";
  const containerStatus = data?.containerStatus ?? "—";
  const apiUrl = data?.url ?? "http://127.0.0.1:8188";

  const installed = modelData?.installed ?? data?.installedModels ?? [];
  const available = modelData?.available ?? data?.availableDownloads ?? [];

  const checkpoints = installed.filter((m) => m.type === "checkpoint");
  const loras = installed.filter((m) => m.type === "lora");
  const others = installed.filter((m) => m.type !== "checkpoint" && m.type !== "lora");

  // Combine active + queued + completed downloads for display
  const allDownloads = [
    ...(downloads?.active ?? []),
    ...(downloads?.queued ?? []),
    ...(downloads?.completed ?? []),
  ];
  const activeAndQueued = [
    ...(downloads?.active ?? []),
    ...(downloads?.queued ?? []),
  ];

  // Filter available models — hide those currently downloading or queued
  const downloadingModelIds = new Set(activeAndQueued.map((d) => d.modelId));

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="ComfyUI Studio"
        description="GPU-accelerated AI art & video generation — FLUX.2, SDXL, LTX Video"
        icon={<Palette size={28} />}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => {
                refetch();
                refetchModels();
                pollDownloads();
              }}
            >
              Refresh
            </Button>
            {isRunning ? (
              <a
                href={apiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button variant="outline" size="sm" icon={<ExternalLink size={14} />}>
                  Open UI
                </Button>
              </a>
            ) : (
              <Button
                size="sm"
                icon={actionPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                onClick={launchComfyUI}
                disabled={actionPending}
              >
                Launch
              </Button>
            )}
          </div>
        }
      />

      {/* Action feedback */}
      {actionMsg && (
        <Alert variant={actionMsg.type === "ok" ? "success" : "danger"}>
          <div className="flex items-center gap-2">
            {actionMsg.type === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span className="font-mono text-xs break-all">{actionMsg.text}</span>
          </div>
        </Alert>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard
          label="Status"
          value={isRunning ? "Online" : "Offline"}
          icon={isRunning ? <Play size={16} /> : <Square size={16} />}
        />
        <StatCard
          label="GPU"
          value={gpuAvailable ? (gpu?.name ?? "Available") : "N/A"}
          sub={gpuAvailable ? gpu?.vram : gpu?.error?.slice(0, 30)}
          icon={<Cpu size={16} />}
        />
        <StatCard
          label="Models"
          value={installed.length}
          sub={`${checkpoints.length} checkpoint${checkpoints.length !== 1 ? "s" : ""}`}
          icon={<HardDrive size={16} />}
        />
        <StatCard
          label="Docker"
          value={data?.dockerAvailable ? "Ready" : "N/A"}
          sub={containerName !== "—" ? containerName : undefined}
          icon={<Box size={16} />}
        />
        <StatCard
          label="Downloads"
          value={activeAndQueued.length}
          sub={activeAndQueued.length > 0 ? "in progress" : "idle"}
          icon={<Download size={16} />}
        />
      </div>

      {/* Server Status Banner */}
      <div
        className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${
          isRunning
            ? "bg-success/10 border-success/30"
            : "bg-bg-secondary border-border/30"
        }`}
      >
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 ${
            isRunning ? "bg-success animate-pulse" : "bg-border"
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-text-heading flex items-center gap-2">
            ComfyUI Server{" "}
            <Badge variant={isRunning ? "success" : "neutral"}>
              {isRunning ? "running" : "stopped"}
            </Badge>
            {gpuAvailable && (
              <Badge variant="purple">
                <Cpu size={10} className="mr-1 inline" />
                {gpu?.name ?? "GPU"}
              </Badge>
            )}
          </p>
          <p className="text-xs text-text-muted font-mono mt-0.5 truncate">
            {apiUrl}
            {containerName !== "—" && ` • Container: ${containerName}`}
          </p>
        </div>
        {!isRunning && (
          <Button
            size="sm"
            icon={actionPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            onClick={launchComfyUI}
            disabled={actionPending}
          >
            Launch
          </Button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          DOWNLOAD MANAGER — Active, Queued, Completed
         ═══════════════════════════════════════════════════════════════ */}
      {allDownloads.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-heading flex items-center gap-2">
              <ArrowDown size={16} className={hasActiveDownloads ? "text-accent animate-bounce" : "text-text-muted"} />
              Download Manager
              {hasActiveDownloads && (
                <Badge variant="info">{activeAndQueued.length} active</Badge>
              )}
            </h3>
            {(downloads?.completed?.length ?? 0) > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={12} />}
                onClick={clearHistory}
                aria-label="Clear download history"
              >
                Clear history
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {allDownloads.map((dl) => (
              <DownloadRow
                key={dl.id}
                dl={dl}
                onPause={pauseDownload}
                onResume={resumeDownload}
                onCancel={cancelDownload}
              />
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Installed Models */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <HardDrive size={16} />
            Installed Models
            <Badge variant="neutral">{installed.length}</Badge>
          </h3>
          {installed.length === 0 ? (
            <div className="text-center py-8">
              <HardDrive size={32} className="mx-auto text-text-muted mb-3 opacity-40" />
              <p className="text-sm text-text-muted">No models installed yet.</p>
              <p className="text-xs text-text-muted mt-1">Download models from the panel on the right →</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {installed.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-bg-secondary hover:bg-bg-primary transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {modelTypeIcon(m.type)}
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate max-w-[200px]" title={m.name}>
                        {m.name}
                      </p>
                      <p className="text-[10px] text-text-muted font-mono truncate max-w-[200px]">
                        {m.filename}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-text-muted">{formatBytes(m.sizeBytes)}</span>
                    {modelTypeBadge(m.type)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Model type breakdown */}
          {installed.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/30">
              <div className="flex flex-wrap gap-3 text-xs text-text-muted">
                {checkpoints.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Box size={10} className="text-accent" /> {checkpoints.length} checkpoint{checkpoints.length !== 1 ? "s" : ""}
                  </span>
                )}
                {loras.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Sparkles size={10} className="text-purple" /> {loras.length} LoRA{loras.length !== 1 ? "s" : ""}
                  </span>
                )}
                {others.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Zap size={10} className="text-warning" /> {others.length} other
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Available Downloads */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Download size={16} />
            Model Library
            <Badge variant="neutral">{available.length}</Badge>
          </h3>
          {available.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 size={32} className="mx-auto text-success mb-3 opacity-60" />
              <p className="text-sm text-text-secondary">All available models are installed!</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {available.map((m) => {
                const isDownloading = downloadingModelIds.has(m.id);
                return (
                  <div
                    key={m.id}
                    className={`p-3 rounded-lg border transition-colors ${
                      isDownloading
                        ? "border-accent/30 bg-accent/5"
                        : "border-border/30 bg-bg-secondary hover:border-border-hover"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {modelTypeIcon(m.type)}
                          <p className="text-sm font-medium text-text-heading truncate">{m.name}</p>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed">{m.description}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {modelTypeBadge(m.type)}
                          <Badge variant="neutral">{m.sizeEstimate}</Badge>
                          {m.requirements.filter((r) => r !== "ComfyUI").map((r) => (
                            <Badge key={r} variant="neutral">{r}</Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isDownloading ? "outline" : "primary"}
                        icon={
                          isDownloading
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Download size={14} />
                        }
                        onClick={() => startDownload(m.id)}
                        disabled={isDownloading}
                        aria-label={`Download ${m.name}`}
                      >
                        {isDownloading ? "In Queue" : "Download"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* GPU Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Cpu size={16} />
            GPU / CUDA
          </h3>
          {gpuAvailable ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10">
                <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-text-heading">{gpu?.name}</p>
                  <p className="text-xs text-text-muted">VRAM: {gpu?.vram}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-bg-secondary">
                  <p className="text-text-muted">Driver</p>
                  <p className="text-text-primary font-mono">{gpu?.driverVersion ?? "—"}</p>
                </div>
                <div className="p-2 rounded bg-bg-secondary">
                  <p className="text-text-muted">Compute Cap.</p>
                  <p className="text-text-primary font-mono">{gpu?.cudaVersion ?? "—"}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <Cpu size={24} className="mx-auto text-text-muted opacity-40 mb-2" />
              <p className="text-xs text-text-muted">
                {gpu?.error ? gpu.error.slice(0, 100) : "No NVIDIA GPU detected."}
              </p>
            </div>
          )}
        </Card>

        {/* Container Info */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Box size={16} />
            Container
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="p-2 rounded bg-bg-secondary flex justify-between">
                <span className="text-text-muted">Name</span>
                <span className="text-text-primary font-mono truncate max-w-[150px]">{containerName}</span>
              </div>
              <div className="p-2 rounded bg-bg-secondary flex justify-between">
                <span className="text-text-muted">Status</span>
                <Badge variant={containerStatus.toLowerCase().includes("up") ? "success" : "neutral"}>
                  {containerStatus !== "—" ? containerStatus.slice(0, 30) : "not running"}
                </Badge>
              </div>
              <div className="p-2 rounded bg-bg-secondary flex justify-between">
                <span className="text-text-muted">Image</span>
                <span className="text-text-primary font-mono text-[10px] truncate max-w-[150px]">
                  yanwk/comfyui-boot:cu128-megapak
                </span>
              </div>
              <div className="p-2 rounded bg-bg-secondary flex justify-between">
                <span className="text-text-muted">Port</span>
                <span className="text-text-primary font-mono">8188 / 8189</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Sparkles size={16} />
            Quick Actions
          </h3>
          <div className="space-y-2">
            <Button
              size="sm"
              className="w-full justify-start"
              variant={isRunning ? "outline" : "primary"}
              icon={actionPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              onClick={launchComfyUI}
              disabled={actionPending}
            >
              {isRunning ? "Restart ComfyUI" : "Launch ComfyUI"}
            </Button>
            {isRunning && (
              <a href={apiUrl} target="_blank" rel="noopener noreferrer" className="block">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  icon={<ExternalLink size={14} />}
                >
                  Open ComfyUI Web UI
                </Button>
              </a>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              icon={<RefreshCw size={14} />}
              onClick={() => {
                refetch();
                refetchModels();
                pollDownloads();
              }}
            >
              Refresh Status
            </Button>
            <div className="pt-2 border-t border-border/30 mt-2 space-y-1.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
                Supported Models
              </p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="info">FLUX.2</Badge>
                <Badge variant="info">SDXL</Badge>
                <Badge variant="purple">LTX Video</Badge>
                <Badge variant="neutral">SD 1.5</Badge>
              </div>
              <p className="text-[10px] text-text-muted mt-2">
                Use <code className="font-mono bg-bg-secondary px-1 rounded">comfyui_generate</code> in chat to generate images and videos.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Download Row Component ─────────────────────────────────────

function DownloadRow({
  dl,
  onPause,
  onResume,
  onCancel,
}: {
  dl: DownloadProgress;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const isActive = dl.state === "downloading";
  const isPaused = dl.state === "paused";
  const isQueued = dl.state === "queued";
  const isDone = dl.state === "completed";
  const isFailed = dl.state === "failed";

  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        isActive
          ? "border-accent/40 bg-accent/5"
          : isPaused
            ? "border-warning/30 bg-warning/5"
            : isDone
              ? "border-success/20 bg-success/5"
              : isFailed
                ? "border-danger/20 bg-danger/5"
                : "border-border/20 bg-bg-secondary"
      }`}
    >
      {/* Top row: name + state + actions */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isActive && <Loader2 size={14} className="text-accent animate-spin flex-shrink-0" />}
          {isPaused && <Pause size={14} className="text-warning flex-shrink-0" />}
          {isQueued && <Clock size={14} className="text-text-muted flex-shrink-0" />}
          {isDone && <CheckCircle2 size={14} className="text-success flex-shrink-0" />}
          {isFailed && <AlertTriangle size={14} className="text-danger flex-shrink-0" />}
          {dl.state === "cancelled" && <X size={14} className="text-text-muted flex-shrink-0" />}
          <span className="text-sm font-medium text-text-heading truncate">
            {dl.modelName}
          </span>
          {stateBadge(dl.state)}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isActive && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Pause size={12} />}
              onClick={() => onPause(dl.id)}
              aria-label="Pause download"
            />
          )}
          {isPaused && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Play size={12} />}
              onClick={() => onResume(dl.id)}
              aria-label="Resume download"
            />
          )}
          {(isActive || isPaused || isQueued) && (
            <Button
              size="sm"
              variant="ghost"
              icon={<X size={12} />}
              onClick={() => onCancel(dl.id)}
              aria-label="Cancel download"
            />
          )}
        </div>
      </div>

      {/* Progress bar — only for active/paused downloads */}
      {(isActive || isPaused) && (
        <>
          <ProgressBar
            value={dl.percent}
            max={100}
            labelLeft={
              `${formatBytes(dl.bytesDownloaded)}${dl.bytesTotal > 0 ? ` / ${formatBytes(dl.bytesTotal)}` : ""}`
            }
            labelRight={`${dl.percent.toFixed(1)}%`}
          />
          {/* Speed + ETA row */}
          <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono">
            <span className={stateColor(dl.state)}>
              {isActive ? `↓ ${dl.speed}` : "⏸ paused"}
            </span>
            <span className="text-text-muted">
              {dl.eta !== "—" && dl.eta !== "paused" ? `ETA: ${dl.eta}` : ""}
            </span>
          </div>
        </>
      )}

      {/* Queued state */}
      {isQueued && (
        <div className="text-[10px] text-text-muted font-mono mt-1">
          Waiting in queue…
        </div>
      )}

      {/* Error message */}
      {isFailed && dl.error && (
        <div className="text-[10px] text-danger font-mono mt-1 truncate" title={dl.error}>
          {dl.error}
        </div>
      )}

      {/* Completed */}
      {isDone && (
        <div className="text-[10px] text-success font-mono mt-1">
          ✓ {formatBytes(dl.bytesDownloaded)} downloaded
        </div>
      )}
    </div>
  );
}
