/**
 * LingBotWorldPanel — Dedicated UI for hoc-plugin-lingbot-world
 *
 * Image-to-world simulation video generator powered by LingBot-World
 * (14B parameter DiT model). Supports standard and camera-controlled generation.
 *
 * Gateway methods used:
 *   lingbot.generate, lingbot.status, lingbot.queue, lingbot.cancel, lingbot.config
 */

import {
  Globe,
  Play,
  Square,
  RefreshCw,
  Upload,
  Video,
  Settings,
  Clock,
  Cpu,
  Loader2,
  CheckCircle,
  AlertCircle,
  XCircle,
  Download,
  Film,
  Camera,
  Sliders,
  Info,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Badge, Button, StatCard, ProgressBar, Alert , RpcStatus } from "@/components/ui";
import { rpc, useRpc } from "@/lib/rpc";

// ─── Types ───────────────────────────────────────────────────────

interface WorldJobStatus {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;
  outputPath?: string;
  error?: string;
  prompt?: string;
  resolution?: string;
  frameNum?: number;
  citizenId?: string;
  createdAt?: number;
}

interface WorldConfig {
  modelDir?: string;
  gpuCount?: number;
  useQuantized?: boolean;
  useFsdp?: boolean;
  useT5Cpu?: boolean;
}

interface QueueStatus {
  totalJobs?: number;
  runningJobs?: number;
  completedJobs?: number;
  failedJobs?: number;
  installed?: boolean;
}

// ─── Job Status Badge ─────────────────────────────────────────────

function JobBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { variant: "success" | "warning" | "danger" | "info" | "neutral"; icon: React.ReactNode }
  > = {
    completed: { variant: "success", icon: <CheckCircle size={10} /> },
    running: { variant: "info", icon: <Loader2 size={10} className="animate-spin" /> },
    pending: { variant: "warning", icon: <Clock size={10} /> },
    failed: { variant: "danger", icon: <AlertCircle size={10} /> },
    cancelled: { variant: "neutral", icon: <XCircle size={10} /> },
  };
  const { variant, icon } = map[status] ?? { variant: "neutral" as const, icon: null };
  return (
    <Badge variant={variant}>
      {icon}
      {status}
    </Badge>
  );
}

// ─── Job Row ─────────────────────────────────────────────────────

function JobRow({ job, onRefresh }: { job: WorldJobStatus; onRefresh: () => void }) {
  const [cancelling, setCancelling] = useState(false);

  async function cancel() {
    setCancelling(true);
    try {
      await rpc("republic.plugins.call-gateway", {
        method: "lingbot.cancel",
        params: { jobId: job.id },
      });
      onRefresh();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="border border-border/30 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-text-muted truncate">{job.id.slice(0, 16)}…</p>
          {job.prompt && (
            <p className="text-sm text-text-secondary line-clamp-2 mt-0.5">{job.prompt}</p>
          )}
          <div className="flex gap-2 mt-1 flex-wrap">
            {job.resolution && (
              <Badge variant="info" className="!text-[10px]">
                {job.resolution}
              </Badge>
            )}
            {job.frameNum && (
              <Badge variant="neutral" className="!text-[10px]">
                {job.frameNum} frames
              </Badge>
            )}
          </div>
        </div>
        <JobBadge status={job.status} />
      </div>

      {job.status === "running" && (
        <ProgressBar
          value={(job.progress ?? 0) * 100}
          labelLeft="Generating…"
          labelRight={`${Math.round((job.progress ?? 0) * 100)}%`}
        />
      )}

      {job.error && (
        <p className="text-xs text-danger bg-danger-bg rounded px-2 py-1">{job.error}</p>
      )}

      <div className="flex gap-2">
        {job.status === "completed" && job.outputPath && (
          <Button
            size="sm"
            variant="success"
            icon={<Download size={12} />}
            onClick={() => window.open(`/republic-output/${job.outputPath}`, "_blank")}
          >
            Download MP4
          </Button>
        )}
        {(job.status === "pending" || job.status === "running") && (
          <Button
            size="sm"
            variant="danger"
            loading={cancelling}
            icon={<Square size={12} />}
            onClick={cancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────

export function LingBotWorldPanel() {
  const [prompt, setPrompt] = useState("");
  const [imagePath, setImagePath] = useState("");
  const [resolution, setResolution] = useState<"480*832" | "720*1280">("480*832");
  const [frameNum, setFrameNum] = useState(161);
  const [seed, setSeed] = useState<number | "">("");
  const [cameraMode, setCameraMode] = useState(false);
  const [actionPath, setActionPath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<WorldJobStatus[]>([]);
  const [pollEnabled, setPollEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: configData, loading, error, refetch } = useRpc<{ ok?: boolean; result?: WorldConfig }>(
    "republic.plugins.call-gateway",
    { method: "lingbot.config", params: {} },
  );
  const { data: queueData, refetch: refetchQueue } = useRpc<{ ok?: boolean; result?: QueueStatus }>(
    "republic.plugins.call-gateway",
    { method: "lingbot.queue", params: {} },
  );


  const config = configData?.result;
  const queue = queueData?.result;

  const refreshJobs = useCallback(async () => {
    // Re-fetch status for all tracked jobs
    const updated = await Promise.all(
      jobs.map(async (j) => {
        if (j.status === "completed" || j.status === "failed" || j.status === "cancelled") {
          return j;
        }
        try {
          const r = (await rpc("republic.plugins.call-gateway", {
            method: "lingbot.status",
            params: { jobId: j.id },
          })) as { result?: WorldJobStatus };
          return r?.result ?? j;
        } catch {
          return j;
        }
      }),
    );
    setJobs(updated);
    const hasActive = updated.some((j) => j.status === "pending" || j.status === "running");
    setPollEnabled(hasActive);
  }, [jobs]);

  // Poll active jobs every 3 seconds if any are running/pending
  useEffect(() => {
    if (!pollEnabled) {
      return;
    }
    const timer = setInterval(() => {
      void refetchQueue();
      void refreshJobs();
    }, 3000);
    return () => clearInterval(timer);
  }, [pollEnabled, refetchQueue, refreshJobs]);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  async function submitGeneration() {
    if (!prompt.trim() || !imagePath.trim()) {
      setSubmitError("Both a prompt and an image path are required.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const params: Record<string, unknown> = {
        prompt,
        imagePath,
        resolution,
        frameNum,
        ...(seed !== "" ? { seed: Number(seed) } : {}),
        ...(cameraMode && actionPath ? { actionPath } : {}),
      };
      const result = (await rpc("republic.plugins.call-gateway", {
        method: "lingbot.generate",
        params,
      })) as { result?: WorldJobStatus };

      const job = result?.result;
      if (job?.id) {
        setJobs((prev) => [{ ...job, prompt }, ...prev]);
        setPollEnabled(true);
        refetchQueue();
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex items-start gap-4 p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20">
        <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
          <Globe size={24} className="text-violet-400" />
        </div>
        <div>
          <h2 className="font-bold text-text-heading text-lg">LingBot-World</h2>
          <p className="text-sm text-text-muted leading-relaxed">
            Generate immersive world simulation videos from a single image and a cinematic text
            prompt. Powered by a 14B-parameter Diffusion Transformer model.
          </p>
        </div>
      </div>

      {/* System Config */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="GPU Count" value={config?.gpuCount ?? "—"} icon={<Cpu size={14} />} />
        <StatCard
          label="Model"
          value={config?.useQuantized ? "NF4 (Quantized)" : config?.gpuCount ? "Full FP16" : "—"}
          icon={<Film size={14} />}
        />
        <StatCard label="Running Jobs" value={queue?.runningJobs ?? 0} icon={<Play size={14} />} />
        <StatCard
          label="Completed"
          value={queue?.completedJobs ?? 0}
          icon={<CheckCircle size={14} />}
        />
      </div>

      {/* Not installed warning */}
      {queue?.installed === false && (
        <Alert variant="warning">
          <span className="font-semibold">LingBot-World not installed.</span> The plugin will
          auto-clone and install dependencies on first use. Ensure CUDA GPU with 8GB+ VRAM is
          available.
        </Alert>
      )}

      {/* Generation Form */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Video size={16} className="text-accent" />
          <h3 className="font-semibold text-text-heading">Generate World Video</h3>
        </div>

        <div className="space-y-4">
          {/* Prompt */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              Cinematic Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A sweeping aerial view of a dense jungle canopy at golden hour, camera slowly drifting forward revealing a hidden ancient temple..."
              rows={3}
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          {/* Image Path */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              Input Image Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={imagePath}
                onChange={(e) => setImagePath(e.target.value)}
                placeholder="/path/to/starting-frame.jpg"
                className="flex-1 bg-bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent transition-colors"
              />
              <Button
                variant="outline"
                size="sm"
                icon={<Upload size={13} />}
                onClick={() => fileInputRef.current?.click()}
              >
                Browse
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setImagePath(f.name);
                  }
                }}
              />
            </div>
            <p className="text-[10px] text-text-muted/60 mt-1 flex items-center gap-1">
              <Info size={9} /> Enter the full server-side path to the image file
            </p>
          </div>

          {/* Resolution + Frames */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                Resolution
              </label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as "480*832" | "720*1280")}
                className="w-full bg-bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent transition-colors"
              >
                <option value="480*832">480×832 (Fast, default)</option>
                <option value="720*1280">720×1280 (HD)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                Frames — {frameNum} ({Math.round(frameNum / 16)}s at 16fps)
              </label>
              <input
                type="range"
                min={161}
                max={961}
                step={160}
                value={frameNum}
                onChange={(e) => setFrameNum(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-[9px] text-text-muted/60 mt-0.5">
                <span>~10s</span>
                <span>~60s</span>
              </div>
            </div>
          </div>

          {/* Seed */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              Seed (optional — for reproducible results)
            </label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Leave empty for random"
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Camera Control Toggle */}
          <div className="border border-border/40 rounded-xl p-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cameraMode}
                onChange={(e) => setCameraMode(e.target.checked)}
                className="w-4 h-4 accent-accent rounded"
              />
              <div className="flex items-center gap-2">
                <Camera size={14} className="text-accent" />
                <span className="text-sm font-semibold text-text-heading">Camera Path Control</span>
              </div>
              <Badge variant="purple" className="!text-[10px] ml-auto">
                Advanced
              </Badge>
            </label>
            {cameraMode && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                  Action Directory (contains intrinsics.npy + poses.npy)
                </label>
                <input
                  type="text"
                  value={actionPath}
                  onChange={(e) => setActionPath(e.target.value)}
                  placeholder="/path/to/camera-action-directory/"
                  className="w-full bg-bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent transition-colors"
                />
              </div>
            )}
          </div>

          {submitError && <Alert variant="danger">{submitError}</Alert>}

          <Button
            size="lg"
            loading={submitting}
            icon={<Play size={15} />}
            onClick={() => void submitGeneration()}
            disabled={!prompt.trim() || !imagePath.trim()}
            className="w-full"
          >
            {submitting ? "Submitting…" : "Generate World Video"}
          </Button>
        </div>
      </Card>

      {/* Jobs List */}
      {jobs.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sliders size={15} className="text-accent" />
              <h3 className="font-semibold text-text-heading">Generation Queue</h3>
            </div>
            <div className="flex gap-2 items-center">
              {pollEnabled && <Loader2 size={12} className="text-text-muted animate-spin" />}
              <Button
                size="sm"
                variant="ghost"
                icon={<RefreshCw size={12} />}
                onClick={() => void refreshJobs()}
              >
                Refresh
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onRefresh={() => void refreshJobs()} />
            ))}
          </div>
        </Card>
      )}

      {/* Config Details */}
      {config && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Settings size={14} className="text-accent" />
            <h3 className="text-sm font-semibold text-text-heading">Engine Configuration</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between border-b border-border/20 pb-1.5">
              <span className="text-text-muted">GPU Count</span>
              <span className="font-mono text-text-secondary">{config.gpuCount ?? "—"}</span>
            </div>
            <div className="flex justify-between border-b border-border/20 pb-1.5">
              <span className="text-text-muted">Quantized</span>
              <span className="font-mono text-text-secondary">
                {config.useQuantized ? "Yes (NF4)" : "No (FP16)"}
              </span>
            </div>
            <div className="flex justify-between border-b border-border/20 pb-1.5">
              <span className="text-text-muted">FSDP Multi-GPU</span>
              <span className="font-mono text-text-secondary">
                {config.useFsdp ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-between border-b border-border/20 pb-1.5">
              <span className="text-text-muted">T5 on CPU</span>
              <span className="font-mono text-text-secondary">
                {config.useT5Cpu ? "Yes" : "No"}
              </span>
            </div>
            {config.modelDir && (
              <div className="col-span-2 flex justify-between">
                <span className="text-text-muted">Model Directory</span>
                <span className="font-mono text-text-secondary text-right truncate max-w-[200px]">
                  {config.modelDir}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
