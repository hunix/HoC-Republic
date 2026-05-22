/**
 * Agent Desktop — Sandbox Pool Monitor
 *
 * A command-center UI for the shared sandbox container.
 * Shows pool status, task queue, active tasks, noVNC desktop, and terminal.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useRpc, rpc, mutateRpc } from "@/lib/rpc";
import {
  Monitor,
  Play,
  Square,
  Trash2,
  Terminal,
  Maximize2,
  Minimize2,
  Send,
  RefreshCw,
  Clock,
  Cpu,
  Layers,
  Activity,
  XCircle,
  HardDrive,
  Gpu,
  AlertTriangle,
} from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  StatCard,
  Tabs,
  RpcStatus,
  EmptyState,
  ConfirmDialog,
  Alert,
} from "@/components/ui";

// ─── Types ──────────────────────────────────────────────────────

interface PoolStatus {
  containerRunning: boolean;
  containerReady: boolean;
  containerFailing: boolean;
  restartCount: number;
  imageKind: "custom" | "fallback" | "unknown";
  containerId: string | null;
  queueDepth: number;
  activeTasks: number;
  maxConcurrent: number;
  totalCompleted: number;
  totalFailed: number;
  availableFlavors: string[];
  gpuAvailable: boolean;
  modelVolumes: string[];
  ports: { novnc: number; preview: number; api: number };
  urls: { novnc: string; preview: string; api: string };
  apiAvailable: boolean;
  novncAvailable: boolean;
}

interface SandboxTask {
  id: string;
  citizenId: string;
  citizenName: string;
  type: string;
  flavor?: string;
  priority: number;
  status: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  workspaceDir: string;
  targetNode?: string;
  result?: {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    filesCreated: string[];
    error?: string;
  };
}

interface QueueSnapshot {
  queued: SandboxTask[];
  active: SandboxTask[];
  recent: SandboxTask[];
}

// ─── Component ──────────────────────────────────────────────────

export function AgentDesktopPage() {
  // ALL hooks at the top before conditional returns
  const { data: statusData, loading: statusLoading, error: statusError, refetch: refetchStatus } =
    useRpc<{ ok: boolean } & PoolStatus>("republic.sandbox.status", {}, [], {
      refetchIntervalMs: 30_000, // 30s — avoids causing iframe reloads on every poll
    });

  const { data: queueData, refetch: refetchQueue } =
    useRpc<{ ok: boolean } & QueueSnapshot>("republic.sandbox.queue", {}, [], {
      refetchIntervalMs: 10_000,
    });

  const [activeTab, setActiveTab] = useState("queue");
  const [fullscreen, setFullscreen] = useState(false);
  const [cmdInput, setCmdInput] = useState("");
  const [cmdOutput, setCmdOutput] = useState<string[]>([]);
  const [cmdRunning, setCmdRunning] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const termRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [cmdOutput]);

  const handleStart = useCallback(async () => {
    await mutateRpc("republic.sandbox.start", {});
    refetchStatus();
  }, [refetchStatus]);

  const handleStop = useCallback(async () => {
    await mutateRpc("republic.sandbox.stop", {});
    refetchStatus();
    setConfirmAction(null);
  }, [refetchStatus]);

  const handleDestroy = useCallback(async () => {
    await mutateRpc("republic.sandbox.destroy", {});
    refetchStatus();
    setConfirmAction(null);
  }, [refetchStatus]);

  const handleExec = useCallback(async () => {
    if (!cmdInput.trim()) { return; }
    setCmdRunning(true);
    setCmdOutput((prev) => [...prev, `$ ${cmdInput}`]);
    try {
      const res = await rpc("republic.sandbox.exec", { command: cmdInput, timeout: 30 });
      const r = res as { stdout?: string; stderr?: string; exitCode?: number; durationMs?: number };
      if (r.stdout) { setCmdOutput((prev) => [...prev, r.stdout!]); }
      if (r.stderr) { setCmdOutput((prev) => [...prev, `stderr: ${r.stderr}`]); }
      setCmdOutput((prev) => [...prev, `[exit ${r.exitCode ?? "?"}] ${r.durationMs ?? 0}ms`]);
    } catch (err) {
      setCmdOutput((prev) => [...prev, `Error: ${err}`]);
    }
    setCmdInput("");
    setCmdRunning(false);
  }, [cmdInput]);

  const handleCancelTask = useCallback(async (taskId: string) => {
    await rpc("republic.sandbox.task.cancel", { taskId });
    refetchQueue();
  }, [refetchQueue]);

  // RpcStatus guard after all hooks
  if (statusLoading || statusError) {
    return <RpcStatus loading={statusLoading} error={statusError} onRetry={refetchStatus} />;
  }

  const pool = statusData as PoolStatus | undefined;
  const queue = queueData as QueueSnapshot | undefined;
  const isRunning = pool?.containerRunning ?? false;
  const isReady = pool?.containerReady ?? false;
  const isFailing = pool?.containerFailing ?? false;

  const tabs = [
    { id: "queue", label: "Task Queue" },
    { id: "desktop", label: "Desktop" },
    { id: "terminal", label: "Terminal" },
    { id: "preview", label: "Preview" },
  ];

  return (
    <div className={`p-6 space-y-6 animate-fade-in ${fullscreen ? "fixed inset-0 z-50 bg-bg-primary" : ""}`}>
      <PageHeader
        title="Agent Sandbox"
        description="Shared sandbox pool — one container, priority task queue, workspace isolation"
        icon={<Monitor size={28} />}
        actions={
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <Button variant="success" size="sm" onClick={handleStart}>
                <Play size={14} className="mr-1" /> Start Container
              </Button>
            ) : (
              <>
                <Button variant="warning" size="sm" onClick={() => setConfirmAction("stop")}>
                  <Square size={14} className="mr-1" /> Stop
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmAction("destroy")}>
                  <Trash2 size={14} className="mr-1" /> Destroy
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => { refetchStatus(); refetchQueue(); }}>
              <RefreshCw size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => setFullscreen(!fullscreen)}
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </Button>
          </div>
        }
      />

      {/* Crash-loop Alert */}
      {isFailing && (
        <Alert variant="danger">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Container crash loop detected</p>
              <p className="text-sm mt-1 opacity-90">
                The sandbox container ({pool?.imageKind === "fallback" ? "ubuntu fallback image" : "hoc/agent-sandbox:latest"}) is
                restarting repeatedly (restarts: {pool?.restartCount ?? "?"}). This usually means the image
                has no long-running process as its entrypoint. Click <strong>Rebuild &amp; Restart</strong> to
                remove the broken container — the gateway will recreate it correctly on next start.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={13} />}
              onClick={handleDestroy}
            >
              Rebuild &amp; Restart
            </Button>
          </div>
        </Alert>
      )}

      {/* Pool Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <StatCard
          label="Container"
          value={isFailing ? "Failing" : isReady ? "Ready" : isRunning ? "Starting" : "Stopped"}
          icon={<Monitor size={18} />}
        />
        <StatCard
          label="Queue Depth"
          value={String(pool?.queueDepth ?? 0)}
          icon={<Layers size={18} />}
        />
        <StatCard
          label="Active Tasks"
          value={`${pool?.activeTasks ?? 0} / ${pool?.maxConcurrent ?? 3}`}
          icon={<Activity size={18} />}
        />
        <StatCard
          label="GPU"
          value={pool?.gpuAvailable ? "Available" : "None"}
          icon={<Gpu size={18} />}
        />
        <StatCard
          label="Model Volumes"
          value={String((pool?.modelVolumes ?? []).length)}
          sub={(pool?.modelVolumes ?? []).length > 0 ? "Mounted" : "No models"}
          icon={<HardDrive size={18} />}
        />
        <StatCard
          label="Flavors"
          value={String((pool?.availableFlavors ?? []).length)}
          sub={(pool?.availableFlavors ?? []).join(", ")}
          icon={<Cpu size={18} />}
        />
        <StatCard
          label="Completed"
          value={String(pool?.totalCompleted ?? 0)}
          icon={<Clock size={18} />}
        />
        <StatCard
          label="Failed"
          value={String(pool?.totalFailed ?? 0)}
          icon={<XCircle size={18} />}
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === "queue" && (
        <TaskQueueView queue={queue} onCancel={handleCancelTask} />
      )}
      {activeTab === "desktop" && (
        <DesktopView urls={pool?.urls} isReady={isReady} />
      )}
      {activeTab === "terminal" && (
        <TerminalView
          termRef={termRef}
          cmdInput={cmdInput}
          cmdOutput={cmdOutput}
          cmdRunning={cmdRunning}
          isReady={isReady}
          apiAvailable={pool?.apiAvailable ?? false}
          onInputChange={setCmdInput}
          onExec={handleExec}
        />
      )}
      {activeTab === "preview" && (
        <PreviewView urls={pool?.urls} isReady={isReady} />
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirmAction === "stop"}
        title="Stop Sandbox"
        message="This will cancel all queued tasks and stop the container. Active tasks will be interrupted."
        onConfirm={handleStop}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "destroy"}
        title="Destroy Sandbox"
        message="This will permanently remove the container and all workspace data. You'll need to restart to use the sandbox again."
        onConfirm={handleDestroy}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

// ─── Sub-Views ──────────────────────────────────────────────────

function TaskQueueView({ queue, onCancel }: { queue: QueueSnapshot | undefined; onCancel: (id: string) => void }) {
  const active = queue?.active ?? [];
  const queued = queue?.queued ?? [];
  const recent = queue?.recent ?? [];

  if (active.length === 0 && queued.length === 0 && recent.length === 0) {
    return (
      <EmptyState
        icon={<Layers size={40} />}
        title="No sandbox tasks"
        description="Tasks submitted by citizens or admin will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <Card>
          <h3 className="text-text-heading font-semibold mb-3 flex items-center gap-2">
            <Activity size={16} className="text-success" /> Active ({active.length})
          </h3>
          <TaskTable tasks={active} onCancel={onCancel} />
        </Card>
      )}
      {queued.length > 0 && (
        <Card>
          <h3 className="text-text-heading font-semibold mb-3 flex items-center gap-2">
            <Clock size={16} className="text-warning" /> Queued ({queued.length})
          </h3>
          <TaskTable tasks={queued} onCancel={onCancel} />
        </Card>
      )}
      {recent.length > 0 && (
        <Card>
          <h3 className="text-text-heading font-semibold mb-3 flex items-center gap-2">
            <Clock size={16} className="text-text-muted" /> Recent ({recent.length})
          </h3>
          <TaskTable tasks={recent} />
        </Card>
      )}
    </div>
  );
}

function TaskTable({ tasks, onCancel }: { tasks: SandboxTask[]; onCancel?: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
         <tr className="text-text-muted border-b border-border">
            <th className="text-left py-2 px-3">Citizen</th>
            <th className="text-left py-2 px-3">Type</th>
            <th className="text-left py-2 px-3">Flavor</th>
            <th className="text-left py-2 px-3">Node</th>
            <th className="text-left py-2 px-3">Priority</th>
            <th className="text-left py-2 px-3">Status</th>
            <th className="text-left py-2 px-3">Duration</th>
            {onCancel && <th className="text-left py-2 px-3"></th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-border/30 hover:bg-bg-secondary/50">
              <td className="py-2 px-3 text-text-primary">{task.citizenName}</td>
              <td className="py-2 px-3">
                <Badge variant="info">{task.type}</Badge>
              </td>
              <td className="py-2 px-3">
                <Badge variant={task.flavor && ["diffusion", "video", "audio", "ml"].includes(task.flavor) ? "purple" : "neutral"}>
                  {task.flavor ?? "exec"}
                </Badge>
              </td>
              <td className="py-2 px-3 text-text-muted text-xs">{task.targetNode ?? "local"}</td>
              <td className="py-2 px-3 text-text-secondary">{task.priority}</td>
              <td className="py-2 px-3">
                <Badge
                  variant={
                    task.status === "running" ? "warning" :
                    task.status === "success" ? "success" :
                    task.status === "failed" || task.status === "timeout" ? "danger" :
                    task.status === "queued" ? "info" : "neutral"
                  }
                >
                  {task.status}
                </Badge>
              </td>
              <td className="py-2 px-3 text-text-muted">
                {task.result?.durationMs ? `${(task.result.durationMs / 1000).toFixed(1)}s` : "—"}
              </td>
              {onCancel && (
                <td className="py-2 px-3">
                  <Button variant="ghost" size="sm" onClick={() => onCancel(task.id)} aria-label="Cancel task">
                    <XCircle size={14} />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



function DesktopView({ urls: _urls, isReady }: { urls?: PoolStatus["urls"]; isReady: boolean }) {
  if (!isReady) {
    return (
      <EmptyState
        icon={<Monitor size={40} />}
        title="Container not ready"
        description="Start the sandbox container to view the desktop."
      />
    );
  }
  // Use gateway proxy path instead of direct port access to avoid cross-origin iframe refusal
  const desktopUrl = `/sandbox-novnc/vnc_lite.html?autoconnect=true&resize=remote&path=sandbox-novnc/websockify`;
  return (
    <Card>
      <iframe
        src={desktopUrl}
        title="Sandbox Desktop (noVNC)"
        className="w-full rounded-lg border border-border"
        style={{ height: "70vh" }}
        allow="clipboard-read; clipboard-write"
      />
    </Card>
  );
}

function TerminalView({
  termRef, cmdInput, cmdOutput, cmdRunning, isReady, apiAvailable, onInputChange, onExec,
}: {
  termRef: React.RefObject<HTMLDivElement | null>;
  cmdInput: string;
  cmdOutput: string[];
  cmdRunning: boolean;
  isReady: boolean;
  apiAvailable: boolean;
  onInputChange: (v: string) => void;
  onExec: () => void;
}) {
  if (!isReady) {
    return (
      <EmptyState
        icon={<Terminal size={40} />}
        title="Container not ready"
        description="Start the sandbox container to use the terminal."
      />
    );
  }
  return (
    <Card>
      {!apiAvailable && (
        <div className="flex items-center gap-2 px-4 py-2 bg-warning-bg border-b border-border text-warning text-xs">
          <Terminal size={12} />
          <span>Basic mode — running via <strong>docker exec</strong>. Full API not available (ubuntu:22.04 fallback image).</span>
        </div>
      )}
      <div
        ref={termRef}
        className="bg-black text-green-400 font-mono text-sm p-4 rounded-t-lg overflow-y-auto"
        style={{ height: "50vh" }}
      >
        {cmdOutput.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
        ))}
        {cmdRunning && <div className="animate-pulse">Running...</div>}
      </div>
      <div className="flex items-center gap-2 p-3 bg-bg-secondary rounded-b-lg border-t border-border">
        <span className="text-text-muted font-mono text-sm">$</span>
        <input
          type="text"
          value={cmdInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { onExec(); } }}
          placeholder="Enter command..."
          className="flex-1 bg-bg-input text-text-primary border border-border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-accent"
          disabled={cmdRunning}
        />
        <Button variant="primary" size="sm" onClick={onExec} disabled={cmdRunning || !cmdInput.trim()}>
          <Send size={14} />
        </Button>
      </div>
    </Card>
  );
}

function PreviewView({ urls: _urls, isReady }: { urls?: PoolStatus["urls"]; isReady: boolean }) {
  if (!isReady) {
    return (
      <EmptyState
        icon={<Monitor size={40} />}
        title="Container not ready"
        description="Start the sandbox container to see previews."
      />
    );
  }
  return (
    <Card>
      <iframe
        src={"/sandbox/"}
        title="Sandbox Live Preview"
        className="w-full rounded-lg border border-border"
        style={{ height: "70vh" }}
        allow="clipboard-read; clipboard-write"
      />
    </Card>
  );
}
